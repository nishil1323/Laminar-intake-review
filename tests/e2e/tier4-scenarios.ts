import { TestCase, TestContext } from './types';
import {
  assertEq,
  assertDefined,
  assertNull,
  assertStatus,
  assertDbCount,
  assertMatches,
  assertIncludes,
} from './helpers/assertions';

export const tier4Tests: TestCase[] = [
  // =========================================================================
  // Tier 4: Real-World Scenarios (5 tests: S1 to S5)
  // =========================================================================
  {
    id: 'T4.S.01',
    name: 'Scenario 1: Complete Note Happy Path with Field Edit (Sample 1)',
    tier: 4,
    category: 'Real-World Scenarios',
    fn: async (ctx: TestContext) => {
      const note = 'Patient DEMO-101 requests a callback. Best time is after 3 p.m.';

      // 1. Extract
      const extRes = await ctx.api.extract(note);
      assertStatus(extRes, 200, 'T4.S.01 extraction');
      assertEq(extRes.body.patientRef, 'DEMO-101');
      assertEq(extRes.body.requestType, 'callback');
      assertEq(extRes.body.callbackPreference, 'after 3 p.m.');

      // 2. Create Draft
      const draftRes = await ctx.api.createDraft(extRes.body);
      assertStatus(draftRes, [200, 201], 'T4.S.01 draft creation');
      const draft = draftRes.body;
      assertEq(draft.status, 'draft');
      assertNull(draft.pmsReference);

      // 3. Staff edits callbackPreference to "after 4 p.m." and approves
      const approveRes = await ctx.api.approveDraft(draft.id, {
        patientRef: 'DEMO-101',
        requestType: 'callback',
        callbackPreference: 'after 4 p.m.',
      });
      assertStatus(approveRes, 200, 'T4.S.01 approval');
      assertEq(approveRes.body.draft.status, 'confirmed');
      assertEq(approveRes.body.draft.callbackPreference, 'after 4 p.m.');
      assertDefined(approveRes.body.draft.pmsReference);
      assertMatches(approveRes.body.draft.pmsReference, /^PMS-\d{8}-\d+$/i);

      // 4. SQLite DB Assertions
      const dbDraft = ctx.db.getDraftById(draft.id);
      assertDefined(dbDraft);
      assertEq(dbDraft.status, 'confirmed');
      assertEq(dbDraft.callback_preference, 'after 4 p.m.');
      assertEq(dbDraft.pms_reference, approveRes.body.draft.pmsReference);

      const dbPms = ctx.db.getPmsEntry(draft.submissionId);
      assertDefined(dbPms, 'PMS entry must be present in SQLite');
      assertEq(dbPms.patient_ref, 'DEMO-101');
      assertEq(dbPms.callback_preference, 'after 4 p.m.');
      assertEq(dbPms.status, 'saved');
      assertEq(dbPms.pms_reference, approveRes.body.draft.pmsReference);

      // 5. Laminar Profile Check
      const profileRes = await ctx.api.getLaminarProfile('DEMO-101');
      assertStatus(profileRes, 200, 'T4.S.01 Laminar profile query');
      const entry = profileRes.body.entries.find(e => e.draftId === draft.id);
      assertDefined(entry, 'Submitted intake must appear in Laminar profile');
      assertEq(entry.status, 'confirmed');
      assertEq(entry.callbackPreference, 'after 4 p.m.');
      assertEq(entry.pmsReference, approveRes.body.draft.pmsReference);
    },
  },
  {
    id: 'T4.S.02',
    name: 'Scenario 2: Incomplete Note Recovery with Missing Patient Ref (Sample 2)',
    tier: 4,
    category: 'Real-World Scenarios',
    fn: async (ctx: TestContext) => {
      const note = 'Caller asks for a prescription refill for lisinopril. Prefers morning callback.';

      // 1. Extract note missing patient reference
      const extRes = await ctx.api.extract(note);
      assertStatus(extRes, 200, 'T4.S.02 extraction');
      assertNull(extRes.body.patientRef, 'patientRef must be null');
      assertEq(extRes.body.requestType, 'refill');
      assertEq(extRes.body.callbackPreference, 'morning');

      // 2. Create draft with null patientRef
      const draftRes = await ctx.api.createDraft(extRes.body);
      assertStatus(draftRes, [200, 201]);
      const draft = draftRes.body;
      assertNull(draft.patientRef);
      assertEq(draft.status, 'draft');

      // 3. Attempt approve without supplying patientRef -> Must be rejected with 400
      const failApprove = await ctx.api.approveDraft(draft.id, {
        patientRef: null,
        requestType: 'refill',
        callbackPreference: 'morning',
      });
      assertStatus(failApprove, 400, 'T4.S.02 approval rejection');
      assertDefined(failApprove.body.errors);
      assertIncludes(failApprove.body.errors.join(' ').toLowerCase(), 'patient reference is required');

      // 4. Verify DB state: Draft is still 'draft', 0 PMS records written
      const dbDraftInitial = ctx.db.getDraftById(draft.id);
      assertEq(dbDraftInitial?.status, 'draft', 'Draft must remain draft after validation error');
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 0, 'No PMS entry created');

      // 5. Correct missing patientRef to "DEMO-102" and approve
      const passApprove = await ctx.api.approveDraft(draft.id, {
        patientRef: 'DEMO-102',
        requestType: 'refill',
        callbackPreference: 'morning',
      });
      assertStatus(passApprove, 200, 'T4.S.02 approval success');
      assertEq(passApprove.body.draft.status, 'confirmed');
      assertEq(passApprove.body.draft.patientRef, 'DEMO-102');
      assertDefined(passApprove.body.draft.pmsReference);

      // 6. DB check: Status confirmed, PMS entry saved
      const dbDraftFinal = ctx.db.getDraftById(draft.id);
      assertEq(dbDraftFinal?.status, 'confirmed');
      assertEq(dbDraftFinal?.patient_ref, 'DEMO-102');
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 1);

      // 7. Laminar Profile Check for DEMO-102
      const profile = (await ctx.api.getLaminarProfile('DEMO-102')).body;
      const entry = profile.entries.find(e => e.draftId === draft.id);
      assertDefined(entry, 'Entry found in DEMO-102 profile');
      assertEq(entry.status, 'confirmed');
      assertEq(entry.requestType, 'refill');
    },
  },
  {
    id: 'T4.S.03',
    name: 'Scenario 3: PMS Timeout Recovery, Verification, and Retry Duplicate Check',
    tier: 4,
    category: 'Real-World Scenarios',
    fn: async (ctx: TestContext) => {
      const pRef = 'DEMO-103';
      const note = `Patient ${pRef} requests a callback. Best time is after 3 p.m.`;

      // 1. Extract & Create Draft
      const extRes = await ctx.api.extract(note);
      const draft = (await ctx.api.createDraft(extRes.body)).body;

      // 2. Approve with timeout simulation header
      const timeoutRes = await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'callback', callbackPreference: 'after 3 p.m.' },
        { simulateTimeout: true }
      );
      assertStatus(timeoutRes, 202, 'T4.S.03 timeout returns 202 Accepted');
      assertEq(timeoutRes.body.draft.status, 'awaiting_confirmation');
      assertNull(timeoutRes.body.draft.pmsReference, 'pmsReference withheld from client');

      // 3. Direct DB verification: PMS entry WAS saved, draft is awaiting_confirmation
      const dbDraftAwaiting = ctx.db.getDraftById(draft.id);
      assertEq(dbDraftAwaiting?.status, 'awaiting_confirmation');
      assertNull(dbDraftAwaiting?.pms_reference);

      const dbPms = ctx.db.getPmsEntry(draft.submissionId);
      assertDefined(dbPms, 'PMS entry was saved despite client timeout');
      assertEq(dbPms.status, 'saved');
      assertDefined(dbPms.pms_reference);

      // 4. Laminar Profile Check (shows awaiting_confirmation)
      let profile = (await ctx.api.getLaminarProfile(pRef)).body;
      let entry = profile.entries.find(e => e.draftId === draft.id);
      assertDefined(entry);
      assertEq(entry.status, 'awaiting_confirmation');
      assertNull(entry.pmsReference);

      // 5. Reconcile via verify endpoint
      const verifyRes = await ctx.api.verifyDraft(draft.id);
      assertStatus(verifyRes, 200, 'T4.S.03 verify endpoint');
      assertEq(verifyRes.body.verified, true);
      assertEq(verifyRes.body.draft.status, 'confirmed');
      assertEq(verifyRes.body.draft.pmsReference, dbPms.pms_reference);

      // 6. Laminar Profile Check (shows confirmed with reference)
      profile = (await ctx.api.getLaminarProfile(pRef)).body;
      entry = profile.entries.find(e => e.draftId === draft.id);
      assertDefined(entry);
      assertEq(entry.status, 'confirmed');
      assertEq(entry.pmsReference, dbPms.pms_reference);

      // 7. Retry Approval (proving duplicate prevention)
      const retryRes = await ctx.api.approveDraft(draft.id, {
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'after 3 p.m.',
      });
      assertStatus(retryRes, 200, 'T4.S.03 retry approve');
      assertEq(retryRes.body.draft.status, 'confirmed');

      // 8. Idempotency Proof: Exactly 1 row in PMS DB and 1 entry in profile
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 1, 'Strictly 1 PMS entry in DB');
      profile = (await ctx.api.getLaminarProfile(pRef)).body;
      const matchingEntries = profile.entries.filter(e => e.draftId === draft.id);
      assertEq(matchingEntries.length, 1, 'Strictly 1 matching entry in profile');
    },
  },
  {
    id: 'T4.S.04',
    name: 'Scenario 4: Multi-Patient Clinic Intake Simulation',
    tier: 4,
    category: 'Real-World Scenarios',
    fn: async (ctx: TestContext) => {
      const ts = Date.now();
      const pA = `DEMO-CLINIC-A-${ts}`;
      const pB = `DEMO-CLINIC-B-${ts}`;
      const pC = `DEMO-CLINIC-C-${ts}`;

      // Patient A Intake 1: Routine callback
      const dA1 = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pA} routine callback`,
          patientRef: pA,
          requestType: 'callback',
          callbackPreference: 'morning',
        })
      ).body;
      const appA1 = await ctx.api.approveDraft(dA1.id, {
        patientRef: pA,
        requestType: 'callback',
        callbackPreference: 'morning',
      });
      assertStatus(appA1, 200);

      // Patient B Intake: Incomplete note -> Rejected -> Fixed -> Confirmed
      const dB = (
        await ctx.api.createDraft({
          rawNote: 'Refill needed urgently for blood pressure meds',
          patientRef: null,
          requestType: 'refill',
          callbackPreference: 'noon',
        })
      ).body;
      const failB = await ctx.api.approveDraft(dB.id, {
        patientRef: null,
        requestType: 'refill',
        callbackPreference: 'noon',
      });
      assertStatus(failB, 400);

      const passB = await ctx.api.approveDraft(dB.id, {
        patientRef: pB,
        requestType: 'refill',
        callbackPreference: 'noon',
      });
      assertStatus(passB, 200);

      // Patient C Intake: Timeout simulation -> Reconciled via verify
      const dC = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pC} transfer request`,
          patientRef: pC,
          requestType: 'transfer',
          callbackPreference: null,
        })
      ).body;
      const appC = await ctx.api.approveDraft(
        dC.id,
        { patientRef: pC, requestType: 'transfer', callbackPreference: null },
        { simulateTimeout: true }
      );
      assertStatus(appC, 202);
      const verifyC = await ctx.api.verifyDraft(dC.id);
      assertStatus(verifyC, 200);

      // Patient A Return Intake: Follow-up refill
      await new Promise(r => setTimeout(r, 15));
      const dA2 = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pA} follow-up refill intake`,
          patientRef: pA,
          requestType: 'refill',
          callbackPreference: 'evening',
        })
      ).body;
      const appA2 = await ctx.api.approveDraft(dA2.id, {
        patientRef: pA,
        requestType: 'refill',
        callbackPreference: 'evening',
      });
      assertStatus(appA2, 200);

      // Assertions across all patients
      const profA = (await ctx.api.getLaminarProfile(pA)).body;
      const profB = (await ctx.api.getLaminarProfile(pB)).body;
      const profC = (await ctx.api.getLaminarProfile(pC)).body;

      assertEq(profA.entries.length, 2, 'Patient A must have exactly 2 intakes');
      assertEq(profB.entries.length, 1, 'Patient B must have exactly 1 intake');
      assertEq(profC.entries.length, 1, 'Patient C must have exactly 1 intake');

      assertEq(profA.entries.every(e => e.status === 'confirmed'), true);
      assertEq(profB.entries.every(e => e.status === 'confirmed'), true);
      assertEq(profC.entries.every(e => e.status === 'confirmed'), true);

      // Ensure distinct submission IDs for Patient A
      assertEq(profA.entries[0].submissionId !== profA.entries[1].submissionId, true);
      assertEq(profA.entries[0].pmsReference !== profA.entries[1].pmsReference, true);

      // Query non-existent patient returns empty array
      const emptyProf = (await ctx.api.getLaminarProfile(`DEMO-UNKNOWN-${ts}`)).body;
      assertEq(emptyProf.entries.length, 0);
    },
  },
  {
    id: 'T4.S.05',
    name: 'Scenario 5: Complex Clinical Intake Note Edge Scenario',
    tier: 4,
    category: 'Real-World Scenarios',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T4-S05-COMPLEX');
      const complexNote = `Patient ${pRef} phoned at 11:45 AM on 2026-11-22 regarding urgent prescription transfer for Metformin 500mg BID and Lisinopril 10mg QD from Walgreens #4021. Best time for callback is before 2:30 p.m. at cell 555-0199 or office 555-0122. Urgent call required.`;

      // 1. Extract complex clinical note
      const extRes = await ctx.api.extract(complexNote);
      assertStatus(extRes, 200, 'T4.S.05 extract complex note');
      assertEq(extRes.body.patientRef, pRef);
      assertEq(extRes.body.requestType, 'transfer');
      assertDefined(extRes.body.callbackPreference);
      assertIncludes(extRes.body.callbackPreference, 'before 2:30 p.m.');

      // 2. Create Draft with full verbatim raw note
      const draftRes = await ctx.api.createDraft(extRes.body);
      assertStatus(draftRes, [200, 201]);
      const draft = draftRes.body;
      assertEq(draft.rawNote, complexNote);

      // 3. Staff refines callback preference during review
      const refinedPreference = 'before 2:30 p.m. (cell 555-0199)';
      const approveRes = await ctx.api.approveDraft(draft.id, {
        patientRef: pRef,
        requestType: 'transfer',
        callbackPreference: refinedPreference,
      });
      assertStatus(approveRes, 200);
      assertEq(approveRes.body.draft.status, 'confirmed');
      assertEq(approveRes.body.draft.callbackPreference, refinedPreference);

      // 4. DB check: Special characters (#, &, punctuation) and refined preference stored cleanly
      const dbDraft = ctx.db.getDraftById(draft.id);
      assertDefined(dbDraft);
      assertEq(dbDraft.raw_note, complexNote);
      assertEq(dbDraft.callback_preference, refinedPreference);

      const dbPms = ctx.db.getPmsEntry(draft.submissionId);
      assertDefined(dbPms);
      assertEq(dbPms.callback_preference, refinedPreference);
      assertEq(dbPms.patient_ref, pRef);

      // 5. Laminar Profile Check
      const profile = (await ctx.api.getLaminarProfile(pRef)).body;
      assertEq(profile.entries.length, 1);
      assertEq(profile.entries[0].status, 'confirmed');
      assertEq(profile.entries[0].callbackPreference, refinedPreference);
    },
  },
];
