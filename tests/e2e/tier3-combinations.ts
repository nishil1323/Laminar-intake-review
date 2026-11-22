import { TestCase, TestContext } from './types';
import {
  assertEq,
  assertDefined,
  assertNull,
  assertStatus,
  assertDbCount,
} from './helpers/assertions';

export const tier3Tests: TestCase[] = [
  // =========================================================================
  // Tier 3: Combinations & Idempotency (10 tests: C1 to C10)
  // =========================================================================
  {
    id: 'T3.C.01',
    name: 'Stable submissionId Invariance Across Multiple Edits',
    tier: 3,
    category: 'Combinations: Stable ID Invariance',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T3-C01');
      const createRes = await ctx.api.createDraft({
        rawNote: `Patient ${pRef} requests a callback. Best time is after 3 p.m.`,
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'after 3 p.m.',
      });
      assertStatus(createRes, [200, 201]);
      const initialSubId = createRes.body.submissionId;

      // Edit 1: change callbackPreference
      const app1 = await ctx.api.approveDraft(createRes.body.id, {
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'after 5 p.m.',
      });
      assertStatus(app1, 200);

      // Verify DB submission_id didn't change
      const row1 = ctx.db.getDraftById(createRes.body.id);
      assertDefined(row1);
      assertEq(row1.submission_id, initialSubId, 'submissionId must not change after edit 1');
      assertEq(row1.callback_preference, 'after 5 p.m.');

      // Edit 2: retry approval with updated requestType
      const app2 = await ctx.api.approveDraft(createRes.body.id, {
        patientRef: pRef,
        requestType: 'refill',
        callbackPreference: 'after 5 p.m.',
      });
      assertStatus(app2, 200);

      const row2 = ctx.db.getDraftById(createRes.body.id);
      assertDefined(row2);
      assertEq(row2.submission_id, initialSubId, 'submissionId must remain invariant after edit 2');
    },
  },
  {
    id: 'T3.C.02',
    name: 'PMS Database-Level Idempotency via Direct Submissions',
    tier: 3,
    category: 'Combinations: PMS Idempotency',
    fn: async (ctx: TestContext) => {
      const testSubId = `SUB-IDEMP-${crypto.randomUUID()}`;
      const pRef = ctx.generatePatientRef('T3-C02');
      const payload = {
        submissionId: testSubId,
        patientRef: pRef,
        requestType: 'refill',
        callbackPreference: 'morning',
      };

      // Call 1
      const res1 = await ctx.api.submitPms(payload);
      assertStatus(res1, 200);
      const ref1 = res1.body.pmsReference;
      assertDefined(ref1);
      assertDbCount(ctx.db.countPmsEntries(testSubId), 1, '1 row after first submit');

      // Call 2 (retry identical payload)
      const res2 = await ctx.api.submitPms(payload);
      assertStatus(res2, 200);
      assertEq(res2.body.pmsReference, ref1, 'Identical pmsReference on 2nd submit');
      assertDbCount(ctx.db.countPmsEntries(testSubId), 1, 'Still 1 row after 2nd submit');

      // Call 3 (retry with altered callbackPreference)
      const res3 = await ctx.api.submitPms({ ...payload, callbackPreference: 'afternoon' });
      assertStatus(res3, 200);
      assertEq(res3.body.pmsReference, ref1, 'Returns original reference on 3rd submit');
      assertDbCount(ctx.db.countPmsEntries(testSubId), 1, 'Still strictly 1 row in pms_entries');
    },
  },
  {
    id: 'T3.C.03',
    name: 'Timeout Simulation: Client Receives 202 While PMS DB Records Entry',
    tier: 3,
    category: 'Combinations: Timeout & Asynchrony',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T3-C03');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} timeout combo test`,
          patientRef: pRef,
          requestType: 'callback',
          callbackPreference: 'after 3 p.m.',
        })
      ).body;

      // Submit with timeout simulation header
      const res = await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'callback', callbackPreference: 'after 3 p.m.' },
        { simulateTimeout: true }
      );

      assertStatus(res, 202, 'Expected HTTP 202 Accepted on timeout');
      assertEq(res.body.draft.status, 'awaiting_confirmation');
      assertNull(res.body.draft.pmsReference, 'pmsReference is withheld from client');

      // Verify draft state in DB
      const dbDraft = ctx.db.getDraftById(draft.id);
      assertEq(dbDraft?.status, 'awaiting_confirmation');
      assertNull(dbDraft?.pms_reference);

      // Verify PMS entry WAS recorded in SQLite despite 202
      const dbPms = ctx.db.getPmsEntry(draft.submissionId);
      assertDefined(dbPms, 'PMS record must exist in DB');
      assertEq(dbPms.status, 'saved');
      assertDefined(dbPms.pms_reference);

      // Verify Laminar profile reflects awaiting_confirmation
      const profile = await ctx.api.getLaminarProfile(pRef);
      assertStatus(profile, 200);
      const entry = profile.body.entries.find(e => e.draftId === draft.id);
      assertDefined(entry);
      assertEq(entry.status, 'awaiting_confirmation');
      assertNull(entry.pmsReference);
    },
  },
  {
    id: 'T3.C.04',
    name: 'Verify Endpoint Reconciles Unconfirmed Draft to Confirmed',
    tier: 3,
    category: 'Combinations: Timeout & Verify',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T3-C04');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} verify combo test`,
          patientRef: pRef,
          requestType: 'refill',
          callbackPreference: 'morning',
        })
      ).body;

      // Trigger timeout simulation
      await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'refill', callbackPreference: 'morning' },
        { simulateTimeout: true }
      );

      // Call verify endpoint
      const verifyRes = await ctx.api.verifyDraft(draft.id);
      assertStatus(verifyRes, 200, 'T3.C.04 verify endpoint');
      assertEq(verifyRes.body.verified, true);
      assertEq(verifyRes.body.draft.status, 'confirmed');
      assertDefined(verifyRes.body.draft.pmsReference);

      // DB check
      const updatedDraft = ctx.db.getDraftById(draft.id);
      assertEq(updatedDraft?.status, 'confirmed');
      assertEq(updatedDraft?.pms_reference, verifyRes.body.draft.pmsReference);

      // Profile check
      const profile = (await ctx.api.getLaminarProfile(pRef)).body;
      const entry = profile.entries.find(e => e.draftId === draft.id);
      assertDefined(entry);
      assertEq(entry.status, 'confirmed');
      assertEq(entry.pmsReference, verifyRes.body.draft.pmsReference);
    },
  },
  {
    id: 'T3.C.05',
    name: 'Approve Route Retry Idempotency Following Confirmation',
    tier: 3,
    category: 'Combinations: Retry Idempotency',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T3-C05');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} retry idempotency test`,
          patientRef: pRef,
          requestType: 'callback',
          callbackPreference: null,
        })
      ).body;

      // First approval
      await ctx.api.approveDraft(draft.id, {
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: null,
      });
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 1);

      // Re-invoke approve (simulating double-click or replay)
      const retryRes = await ctx.api.approveDraft(draft.id, {
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: null,
      });
      assertStatus(retryRes, 200);
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 1, 'Strictly 1 PMS entry in DB');

      const profile = (await ctx.api.getLaminarProfile(pRef)).body;
      const matchingEntries = profile.entries.filter(e => e.draftId === draft.id);
      assertEq(matchingEntries.length, 1, 'Profile has exactly 1 entry for this draft');
    },
  },
  {
    id: 'T3.C.06',
    name: 'Verify Endpoint on Fresh Unsubmitted Draft',
    tier: 3,
    category: 'Combinations: Edge Recovery',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T3-C06');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} unsubmitted draft`,
          patientRef: pRef,
          requestType: 'callback',
          callbackPreference: null,
        })
      ).body;

      const res = await ctx.api.verifyDraft(draft.id);
      assertStatus(res, [200, 400]);
      if (res.status === 200) {
        assertEq(res.body.verified, false, 'Unsubmitted draft cannot be verified');
      }

      const row = ctx.db.getDraftById(draft.id);
      assertEq(row?.status, 'draft', 'Status remains draft');
      assertNull(row?.pms_reference, 'pms_reference remains null');
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 0, 'Zero PMS rows');
    },
  },
  {
    id: 'T3.C.07',
    name: 'Verify Endpoint Idempotency on Confirmed Draft',
    tier: 3,
    category: 'Combinations: Verify Idempotency',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T3-C07');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} verify idempotency test`,
          patientRef: pRef,
          requestType: 'refill',
          callbackPreference: 'morning',
        })
      ).body;

      await ctx.api.approveDraft(draft.id, {
        patientRef: pRef,
        requestType: 'refill',
        callbackPreference: 'morning',
      });

      // Call verify twice
      const res1 = await ctx.api.verifyDraft(draft.id);
      const res2 = await ctx.api.verifyDraft(draft.id);

      assertStatus(res1, 200);
      assertStatus(res2, 200);
      assertEq(res1.body.verified, true);
      assertEq(res2.body.verified, true);
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 1);
    },
  },
  {
    id: 'T3.C.08',
    name: 'Direct Re-Approval After Timeout (Alternative Recovery Path)',
    tier: 3,
    category: 'Combinations: Recovery Alternatives',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T3-C08');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} direct re-approval test`,
          patientRef: pRef,
          requestType: 'callback',
          callbackPreference: 'noon',
        })
      ).body;

      // Timeout
      const tRes = await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'callback', callbackPreference: 'noon' },
        { simulateTimeout: true }
      );
      assertStatus(tRes, 202);
      assertEq(ctx.db.getDraftById(draft.id)?.status, 'awaiting_confirmation');

      // Alternative recovery path: client directly hits approve again without timeout header
      const retryRes = await ctx.api.approveDraft(draft.id, {
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'noon',
      });
      assertStatus(retryRes, 200);
      assertEq(retryRes.body.draft.status, 'confirmed');
      assertDefined(retryRes.body.draft.pmsReference);
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 1);
    },
  },
  {
    id: 'T3.C.09',
    name: 'Multi-Submission Coexistence for Single Patient',
    tier: 3,
    category: 'Combinations: Multi-Submission Aggregation',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T3-C09');

      // Intake 1: Confirmed
      const d1 = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} intake 1`,
          patientRef: pRef,
          requestType: 'callback',
          callbackPreference: 'morning',
        })
      ).body;
      await ctx.api.approveDraft(d1.id, { patientRef: pRef, requestType: 'callback' });

      // Intake 2: Awaiting Confirmation
      const d2 = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} intake 2`,
          patientRef: pRef,
          requestType: 'refill',
          callbackPreference: 'afternoon',
        })
      ).body;
      await ctx.api.approveDraft(
        d2.id,
        { patientRef: pRef, requestType: 'refill' },
        { simulateTimeout: true }
      );

      // Intake 3: Fresh Draft
      const d3 = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} intake 3`,
          patientRef: pRef,
          requestType: 'transfer',
          callbackPreference: null,
        })
      ).body;

      // Verify Laminar profile aggregates all 3 with individual statuses
      const profile = (await ctx.api.getLaminarProfile(pRef)).body;
      assertEq(profile.entries.length >= 3, true, 'At least 3 submissions returned');

      const entry1 = profile.entries.find(e => e.draftId === d1.id);
      const entry2 = profile.entries.find(e => e.draftId === d2.id);
      const entry3 = profile.entries.find(e => e.draftId === d3.id);

      assertDefined(entry1);
      assertDefined(entry2);
      assertDefined(entry3);

      assertEq(entry1.status, 'confirmed');
      assertEq(entry2.status, 'awaiting_confirmation');
      assertEq(entry3.status, 'draft');

      // Distinct submission IDs
      const subIds = new Set([entry1.submissionId, entry2.submissionId, entry3.submissionId]);
      assertEq(subIds.size, 3, 'All 3 submissions must have distinct submission IDs');
    },
  },
  {
    id: 'T3.C.10',
    name: 'Full Lifecycle State Machine Traversal',
    tier: 3,
    category: 'Combinations: State Machine Lifecycle',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T3-C10');

      // 1. Create -> DRAFT
      const d = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} full lifecycle note`,
          patientRef: pRef,
          requestType: 'callback',
          callbackPreference: 'am',
        })
      ).body;
      assertEq(ctx.db.getDraftById(d.id)?.status, 'draft');

      // 2. Timeout Approve -> AWAITING_CONFIRMATION
      const tRes = await ctx.api.approveDraft(
        d.id,
        { patientRef: pRef, requestType: 'callback', callbackPreference: 'pm' },
        { simulateTimeout: true }
      );
      assertStatus(tRes, 202);
      assertEq(ctx.db.getDraftById(d.id)?.status, 'awaiting_confirmation');

      // 3. Verify -> CONFIRMED
      const vRes = await ctx.api.verifyDraft(d.id);
      assertStatus(vRes, 200);
      assertEq(ctx.db.getDraftById(d.id)?.status, 'confirmed');

      // 4. Retry Approve -> CONFIRMED (Idempotent)
      const rRes = await ctx.api.approveDraft(d.id, {
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'pm',
      });
      assertStatus(rRes, 200);
      assertEq(ctx.db.getDraftById(d.id)?.status, 'confirmed');
      assertDbCount(ctx.db.countPmsEntries(d.submissionId), 1);
    },
  },
];
