import { TestCase, TestContext } from './types';
import {
  assertEq,
  assertDefined,
  assertNull,
  assertStatus,
  assertMatches,
  assertIncludes,
  assertDbCount,
} from './helpers/assertions';

export const tier1Tests: TestCase[] = [
  // =========================================================================
  // F1: Raw Note Capture & Mock Extraction (6 tests)
  // =========================================================================
  {
    id: 'T1.F1.01',
    name: 'Complete Intake Note Extraction (Sample 1)',
    tier: 1,
    category: 'F1: Capture & Extraction',
    fn: async (ctx: TestContext) => {
      const note = 'Patient DEMO-101 requests a callback. Best time is after 3 p.m.';
      const res = await ctx.api.extract(note);

      assertStatus(res, 200, 'T1.F1.01');
      assertEq(res.body.patientRef, 'DEMO-101', 'patientRef');
      assertEq(res.body.requestType, 'callback', 'requestType');
      assertEq(res.body.callbackPreference, 'after 3 p.m.', 'callbackPreference');
      assertEq(res.body.rawNote, note, 'rawNote');
    },
  },
  {
    id: 'T1.F1.02',
    name: 'Incomplete Intake Note Extraction (Sample 2: Missing Patient Ref)',
    tier: 1,
    category: 'F1: Capture & Extraction',
    fn: async (ctx: TestContext) => {
      const note = 'Caller asks for a prescription refill for lisinopril. Prefers morning callback.';
      const res = await ctx.api.extract(note);

      assertStatus(res, 200, 'T1.F1.02');
      assertNull(res.body.patientRef, 'patientRef should be null');
      assertEq(res.body.requestType, 'refill', 'requestType');
      assertEq(res.body.callbackPreference, 'morning', 'callbackPreference');
      assertEq(res.body.rawNote, note, 'rawNote');
    },
  },
  {
    id: 'T1.F1.03',
    name: 'Note Extraction with "Transfer" Request Type',
    tier: 1,
    category: 'F1: Capture & Extraction',
    fn: async (ctx: TestContext) => {
      const note = 'Patient RX-404 requests a prescription transfer from CVS. Best time is before noon.';
      const res = await ctx.api.extract(note);

      assertStatus(res, 200, 'T1.F1.03');
      assertEq(res.body.patientRef, 'RX-404', 'patientRef');
      assertEq(res.body.requestType, 'transfer', 'requestType');
      assertEq(res.body.callbackPreference, 'before noon', 'callbackPreference');
    },
  },
  {
    id: 'T1.F1.04',
    name: 'Case-Insensitive Request Type and Prefix Parsing',
    tier: 1,
    category: 'F1: Capture & Extraction',
    fn: async (ctx: TestContext) => {
      const note = 'patient ZEE-999 needs a REFILL urgently. Preferred time: evening.';
      const res = await ctx.api.extract(note);

      assertStatus(res, 200, 'T1.F1.04');
      assertEq(res.body.patientRef, 'ZEE-999', 'patientRef normalized uppercase');
      assertEq(res.body.requestType, 'refill', 'requestType lowercase');
      assertEq(res.body.callbackPreference, 'evening', 'callbackPreference');
    },
  },
  {
    id: 'T1.F1.05',
    name: 'Extraction with Missing Request Type and Explicit Callback Time',
    tier: 1,
    category: 'F1: Capture & Extraction',
    fn: async (ctx: TestContext) => {
      const note = 'Patient DEMO-505 called regarding general pharmacy questions. Best time is 2:30 PM.';
      const res = await ctx.api.extract(note);

      assertStatus(res, 200, 'T1.F1.05');
      assertEq(res.body.patientRef, 'DEMO-505', 'patientRef');
      assertNull(res.body.requestType, 'requestType should be null');
      assertEq(res.body.callbackPreference, '2:30 PM', 'callbackPreference');
    },
  },
  {
    id: 'T1.F1.06',
    name: 'Multiline Formatting and Tabular Spacing Extraction',
    tier: 1,
    category: 'F1: Capture & Extraction',
    fn: async (ctx: TestContext) => {
      const note = '   \n\n\tPatient   CLINIC-777\nRequests: callback\nPreferred: tomorrow morning.\n\n  ';
      const res = await ctx.api.extract(note);

      assertStatus(res, 200, 'T1.F1.06');
      assertEq(res.body.patientRef, 'CLINIC-777', 'patientRef');
      assertEq(res.body.requestType, 'callback', 'requestType');
      assertEq(res.body.callbackPreference, 'tomorrow morning', 'callbackPreference');
    },
  },

  // =========================================================================
  // F2: Draft Creation & Storage (Stable ID) (6 tests)
  // =========================================================================
  {
    id: 'T1.F2.01',
    name: 'Complete Draft Creation with Generated UUIDs',
    tier: 1,
    category: 'F2: Draft Creation & Storage',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F2-01');
      const note = `Patient ${pRef} requests a callback. Best time is after 3 p.m.`;
      const res = await ctx.api.createDraft({
        rawNote: note,
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'after 3 p.m.',
      });

      assertStatus(res, [200, 201], 'T1.F2.01');
      assertDefined(res.body.id, 'Draft id must be defined');
      assertDefined(res.body.submissionId, 'Draft submissionId must be defined');
      assertMatches(
        res.body.id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        'id UUID format'
      );
      assertMatches(
        res.body.submissionId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        'submissionId UUID format'
      );
      assertEq(res.body.id !== res.body.submissionId, true, 'id and submissionId must be distinct');
      assertEq(res.body.status, 'draft', 'status must be draft');
      assertNull(res.body.pmsReference, 'pmsReference must be null at creation');

      // Direct DB inspection
      const row = ctx.db.getDraftById(res.body.id);
      assertDefined(row, 'Draft row must exist in DB');
      assertEq(row.submission_id, res.body.submissionId, 'DB submission_id');
      assertEq(row.patient_ref, pRef, 'DB patient_ref');
      assertEq(row.status, 'draft', 'DB status');
      assertNull(row.pms_reference, 'DB pms_reference');
    },
  },
  {
    id: 'T1.F2.02',
    name: 'Incomplete Draft Creation (Null Patient Reference Allowed)',
    tier: 1,
    category: 'F2: Draft Creation & Storage',
    fn: async (ctx: TestContext) => {
      const note = 'Caller asks for refill. Morning callback.';
      const res = await ctx.api.createDraft({
        rawNote: note,
        patientRef: null,
        requestType: 'refill',
        callbackPreference: 'morning',
      });

      assertStatus(res, [200, 201], 'T1.F2.02');
      assertNull(res.body.patientRef, 'patientRef must be null in response');
      assertEq(res.body.status, 'draft', 'status must be draft');

      const row = ctx.db.getDraftById(res.body.id);
      assertDefined(row, 'Draft row must exist');
      assertNull(row.patient_ref, 'patient_ref must be null in SQLite');
    },
  },
  {
    id: 'T1.F2.03',
    name: 'Single Draft Retrieval by ID',
    tier: 1,
    category: 'F2: Draft Creation & Storage',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F2-03');
      const createRes = await ctx.api.createDraft({
        rawNote: `Patient ${pRef} test single draft retrieval.`,
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'noon',
      });
      assertStatus(createRes, [200, 201], 'Draft creation');

      const getRes = await ctx.api.getDraft(createRes.body.id);
      assertStatus(getRes, 200, 'T1.F2.03 getDraft');
      assertEq(getRes.body.id, createRes.body.id, 'id match');
      assertEq(getRes.body.submissionId, createRes.body.submissionId, 'submissionId match');
      assertEq(getRes.body.patientRef, pRef, 'patientRef match');
      assertEq(getRes.body.requestType, 'callback', 'requestType match');
      assertEq(getRes.body.callbackPreference, 'noon', 'callbackPreference match');
      assertEq(getRes.body.status, 'draft', 'status match');
    },
  },
  {
    id: 'T1.F2.04',
    name: 'Stable submissionId Immutability Across Reads',
    tier: 1,
    category: 'F2: Draft Creation & Storage',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F2-04');
      const createRes = await ctx.api.createDraft({
        rawNote: `Patient ${pRef} immutability check.`,
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: null,
      });
      const initialSubId = createRes.body.submissionId;

      const read1 = await ctx.api.getDraft(createRes.body.id);
      const read2 = await ctx.api.getDraft(createRes.body.id);

      assertEq(read1.body.submissionId, initialSubId, 'First read submissionId matches');
      assertEq(read2.body.submissionId, initialSubId, 'Second read submissionId matches');

      const dbRow = ctx.db.getDraftById(createRes.body.id);
      assertEq(dbRow?.submission_id, initialSubId, 'DB submissionId unchanged');
    },
  },
  {
    id: 'T1.F2.05',
    name: 'Multi-Draft ID & Submission ID Uniqueness',
    tier: 1,
    category: 'F2: Draft Creation & Storage',
    fn: async (ctx: TestContext) => {
      const pRef1 = ctx.generatePatientRef('T1-F2-05A');
      const pRef2 = ctx.generatePatientRef('T1-F2-05B');

      const d1 = await ctx.api.createDraft({
        rawNote: `Patient ${pRef1} draft 1`,
        patientRef: pRef1,
        requestType: 'callback',
      });
      const d2 = await ctx.api.createDraft({
        rawNote: `Patient ${pRef2} draft 2`,
        patientRef: pRef2,
        requestType: 'refill',
      });

      assertStatus(d1, [200, 201]);
      assertStatus(d2, [200, 201]);

      assertEq(d1.body.id !== d2.body.id, true, 'Draft IDs must be unique');
      assertEq(d1.body.submissionId !== d2.body.submissionId, true, 'Submission IDs must be unique');

      const count = ctx.db.countDrafts('id IN (?, ?)', d1.body.id, d2.body.id);
      assertDbCount(count, 2, 'Two separate rows in drafts');
    },
  },
  {
    id: 'T1.F2.06',
    name: 'SQLite Schema & Constraint Verification',
    tier: 1,
    category: 'F2: Draft Creation & Storage',
    fn: async (ctx: TestContext) => {
      assertEq(ctx.db.tableExists('drafts'), true, 'drafts table must exist');
      assertEq(ctx.db.tableExists('pms_entries'), true, 'pms_entries table must exist');

      const columns = ctx.db.query<{ name: string; type: string; notnull: number; pk: number }>(
        'PRAGMA table_info(drafts)'
      );
      const colNames = columns.map(c => c.name);
      assertIncludes(colNames, 'id', 'drafts columns');
      assertIncludes(colNames, 'submission_id', 'drafts columns');
      assertIncludes(colNames, 'raw_note', 'drafts columns');
      assertIncludes(colNames, 'patient_ref', 'drafts columns');
      assertIncludes(colNames, 'request_type', 'drafts columns');
      assertIncludes(colNames, 'callback_preference', 'drafts columns');
      assertIncludes(colNames, 'status', 'drafts columns');
      assertIncludes(colNames, 'pms_reference', 'drafts columns');
      assertIncludes(colNames, 'created_at', 'drafts columns');
      assertIncludes(colNames, 'updated_at', 'drafts columns');
    },
  },

  // =========================================================================
  // F3: Review & Field Validation (Dual-Layer) (6 tests)
  // =========================================================================
  {
    id: 'T1.F3.01',
    name: 'Happy Path Approval of Valid Draft',
    tier: 1,
    category: 'F3: Review & Field Validation',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F3-01');
      const createRes = await ctx.api.createDraft({
        rawNote: `Patient ${pRef} requests a callback. Best time is after 3 p.m.`,
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'after 3 p.m.',
      });
      const draftId = createRes.body.id;

      const approveRes = await ctx.api.approveDraft(draftId, {
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'after 3 p.m.',
      });

      assertStatus(approveRes, 200, 'T1.F3.01 approval');
      assertEq(approveRes.body.draft.status, 'confirmed', 'draft status');
      assertDefined(approveRes.body.draft.pmsReference, 'pmsReference on draft');
      assertMatches(approveRes.body.draft.pmsReference, /^PMS-\d{8}-\d+$/i, 'pmsReference format');

      // DB Assertions
      const dbDraft = ctx.db.getDraftById(draftId);
      assertEq(dbDraft?.status, 'confirmed', 'DB status confirmed');
      assertEq(dbDraft?.pms_reference, approveRes.body.draft.pmsReference, 'DB pms_reference');

      const dbPms = ctx.db.getPmsEntry(createRes.body.submissionId);
      assertDefined(dbPms, 'PMS entry must exist');
      assertEq(dbPms.patient_ref, pRef, 'PMS patient_ref');
      assertEq(dbPms.pms_reference, approveRes.body.draft.pmsReference, 'PMS reference match');
    },
  },
  {
    id: 'T1.F3.02',
    name: 'Rejection of Missing patientRef on Approve',
    tier: 1,
    category: 'F3: Review & Field Validation',
    fn: async (ctx: TestContext) => {
      const createRes = await ctx.api.createDraft({
        rawNote: 'Caller requests refill. Morning callback.',
        patientRef: null,
        requestType: 'refill',
        callbackPreference: 'morning',
      });
      const draftId = createRes.body.id;

      const approveRes = await ctx.api.approveDraft(draftId, {
        patientRef: null,
        requestType: 'refill',
        callbackPreference: 'morning',
      });

      assertStatus(approveRes, 400, 'T1.F3.02 missing patientRef rejected');
      assertDefined(approveRes.body.errors, 'errors array present');
      assertIncludes(approveRes.body.errors[0].toLowerCase(), 'patient reference is required');

      // Proves no PMS write occurred
      const pmsCount = ctx.db.countPmsEntries(createRes.body.submissionId);
      assertDbCount(pmsCount, 0, 'No PMS entry should be created on validation failure');
      const dbDraft = ctx.db.getDraftById(draftId);
      assertEq(dbDraft?.status, 'draft', 'Draft remains in draft status');
    },
  },
  {
    id: 'T1.F3.03',
    name: 'Rejection of Missing requestType on Approve',
    tier: 1,
    category: 'F3: Review & Field Validation',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F3-03');
      const createRes = await ctx.api.createDraft({
        rawNote: `Patient ${pRef} asks questions.`,
        patientRef: pRef,
        requestType: null,
      });

      const approveRes = await ctx.api.approveDraft(createRes.body.id, {
        patientRef: pRef,
        requestType: '',
      });

      assertStatus(approveRes, 400, 'T1.F3.03 missing requestType rejected');
      assertDefined(approveRes.body.errors);
      assertIncludes(approveRes.body.errors.join(' ').toLowerCase(), 'request type is required');

      assertDbCount(ctx.db.countPmsEntries(createRes.body.submissionId), 0);
    },
  },
  {
    id: 'T1.F3.04',
    name: 'Rejection of Whitespace-Only patientRef',
    tier: 1,
    category: 'F3: Review & Field Validation',
    fn: async (ctx: TestContext) => {
      const createRes = await ctx.api.createDraft({
        rawNote: 'Whitespace test note',
        patientRef: null,
        requestType: 'callback',
      });

      const approveRes = await ctx.api.approveDraft(createRes.body.id, {
        patientRef: '     ',
        requestType: 'callback',
      });

      assertStatus(approveRes, 400, 'T1.F3.04 whitespace patientRef rejected');
      assertDefined(approveRes.body.errors);
      assertIncludes(approveRes.body.errors.join(' ').toLowerCase(), 'patient reference is required');
      assertDbCount(ctx.db.countPmsEntries(createRes.body.submissionId), 0);
    },
  },
  {
    id: 'T1.F3.05',
    name: 'Rejection of Whitespace-Only requestType',
    tier: 1,
    category: 'F3: Review & Field Validation',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F3-05');
      const createRes = await ctx.api.createDraft({
        rawNote: `Patient ${pRef} note`,
        patientRef: pRef,
        requestType: 'callback',
      });

      const approveRes = await ctx.api.approveDraft(createRes.body.id, {
        patientRef: pRef,
        requestType: '\t \n ',
      });

      assertStatus(approveRes, 400, 'T1.F3.05 whitespace requestType rejected');
      assertDefined(approveRes.body.errors);
      assertIncludes(approveRes.body.errors.join(' ').toLowerCase(), 'request type is required');
      assertDbCount(ctx.db.countPmsEntries(createRes.body.submissionId), 0);
    },
  },
  {
    id: 'T1.F3.06',
    name: 'Modification of callbackPreference During Approval',
    tier: 1,
    category: 'F3: Review & Field Validation',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F3-06');
      const createRes = await ctx.api.createDraft({
        rawNote: `Patient ${pRef} callback after 3 p.m.`,
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'after 3 p.m.',
      });

      // Staff changes callbackPreference to "after 4 p.m."
      const approveRes = await ctx.api.approveDraft(createRes.body.id, {
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'after 4 p.m.',
      });

      assertStatus(approveRes, 200, 'T1.F3.06 approval with modified field');
      assertEq(approveRes.body.draft.callbackPreference, 'after 4 p.m.', 'modified callback preference');

      const dbDraft = ctx.db.getDraftById(createRes.body.id);
      assertEq(dbDraft?.callback_preference, 'after 4 p.m.', 'DB draft updated');

      const dbPms = ctx.db.getPmsEntry(createRes.body.submissionId);
      assertEq(dbPms?.callback_preference, 'after 4 p.m.', 'DB PMS updated');
    },
  },

  // =========================================================================
  // F4: Idempotent PMS Submission (6 tests)
  // =========================================================================
  {
    id: 'T1.F4.01',
    name: 'Direct PMS Submission Route Functionality',
    tier: 1,
    category: 'F4: Idempotent PMS Submission',
    fn: async (ctx: TestContext) => {
      const testSubId = crypto.randomUUID();
      const pRef = ctx.generatePatientRef('T1-F4-01');

      const res = await ctx.api.submitPms({
        submissionId: testSubId,
        patientRef: pRef,
        requestType: 'callback',
        callbackPreference: 'after 3 p.m.',
      });

      assertStatus(res, 200, 'T1.F4.01 PMS submit');
      assertEq(res.body.submissionId, testSubId, 'submissionId');
      assertEq(res.body.status, 'saved', 'status');
      assertDefined(res.body.pmsReference, 'pmsReference');
      assertMatches(res.body.pmsReference, /^PMS-\d{8}-\d+$/i, 'pmsReference format');

      const dbPms = ctx.db.getPmsEntry(testSubId);
      assertDefined(dbPms, 'PMS entry exists in SQLite');
      assertEq(dbPms.patient_ref, pRef);
    },
  },
  {
    id: 'T1.F4.02',
    name: 'PMS Database Schema and Primary Key Verification',
    tier: 1,
    category: 'F4: Idempotent PMS Submission',
    fn: async (ctx: TestContext) => {
      const columns = ctx.db.query<{ name: string; type: string; notnull: number; pk: number }>(
        'PRAGMA table_info(pms_entries)'
      );
      const subIdCol = columns.find(c => c.name === 'submission_id');
      assertDefined(subIdCol, 'submission_id column exists');
      assertEq(subIdCol.pk, 1, 'submission_id must be PRIMARY KEY (pk=1)');
    },
  },
  {
    id: 'T1.F4.03',
    name: 'PMS Idempotency on Repeated Direct Submissions',
    tier: 1,
    category: 'F4: Idempotent PMS Submission',
    fn: async (ctx: TestContext) => {
      const testSubId = crypto.randomUUID();
      const pRef = ctx.generatePatientRef('T1-F4-03');
      const payload = {
        submissionId: testSubId,
        patientRef: pRef,
        requestType: 'refill',
        callbackPreference: 'morning',
      };

      const res1 = await ctx.api.submitPms(payload);
      assertStatus(res1, 200);
      const ref1 = res1.body.pmsReference;

      const res2 = await ctx.api.submitPms(payload);
      assertStatus(res2, 200);
      assertEq(res2.body.pmsReference, ref1, 'Subsequent submit must return same reference');

      assertDbCount(ctx.db.countPmsEntries(testSubId), 1, 'Strictly 1 row in pms_entries');
    },
  },
  {
    id: 'T1.F4.04',
    name: 'PMS Status Lookup Endpoint for Existing Entry',
    tier: 1,
    category: 'F4: Idempotent PMS Submission',
    fn: async (ctx: TestContext) => {
      const testSubId = crypto.randomUUID();
      const pRef = ctx.generatePatientRef('T1-F4-04');
      await ctx.api.submitPms({
        submissionId: testSubId,
        patientRef: pRef,
        requestType: 'transfer',
        callbackPreference: 'noon',
      });

      const res = await ctx.api.getPmsStatus(testSubId);
      assertStatus(res, 200, 'T1.F4.04 status lookup');
      assertEq(res.body.found, true, 'found must be true');
      assertDefined(res.body.entry, 'entry object present');
      assertEq(res.body.entry.submissionId, testSubId);
      assertEq(res.body.entry.patientRef, pRef);
      assertEq(res.body.entry.status, 'saved');
    },
  },
  {
    id: 'T1.F4.05',
    name: 'Linkage between Draft and PMS Entry on Approval',
    tier: 1,
    category: 'F4: Idempotent PMS Submission',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F4-05');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} note`,
          patientRef: pRef,
          requestType: 'callback',
        })
      ).body;

      const approveRes = await ctx.api.approveDraft(draft.id, {
        patientRef: pRef,
        requestType: 'callback',
      });
      assertStatus(approveRes, 200);

      const dbDraft = ctx.db.getDraftById(draft.id);
      const dbPms = ctx.db.getPmsEntry(draft.submissionId);

      assertDefined(dbDraft?.pms_reference);
      assertDefined(dbPms?.pms_reference);
      assertEq(dbDraft.pms_reference, dbPms.pms_reference, 'PMS reference match across tables');
    },
  },
  {
    id: 'T1.F4.06',
    name: 'Repeated Approval (Retry) on Already Confirmed Draft',
    tier: 1,
    category: 'F4: Idempotent PMS Submission',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F4-06');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} retry test`,
          patientRef: pRef,
          requestType: 'callback',
        })
      ).body;

      const app1 = await ctx.api.approveDraft(draft.id, { patientRef: pRef, requestType: 'callback' });
      assertStatus(app1, 200);

      const app2 = await ctx.api.approveDraft(draft.id, { patientRef: pRef, requestType: 'callback' });
      assertStatus(app2, 200);
      assertEq(app2.body.draft.status, 'confirmed');

      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 1, 'PMS entry count strictly 1');
    },
  },

  // =========================================================================
  // F5: Timeout Simulation & Reconcile Verify (6 tests)
  // =========================================================================
  {
    id: 'T1.F5.01',
    name: 'Approval with X-Simulate-Timeout: true Header Returns 202',
    tier: 1,
    category: 'F5: Timeout Simulation & Verify',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F5-01');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} timeout simulation`,
          patientRef: pRef,
          requestType: 'callback',
          callbackPreference: 'after 3 p.m.',
        })
      ).body;

      const res = await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'callback', callbackPreference: 'after 3 p.m.' },
        { simulateTimeout: true }
      );

      assertStatus(res, 202, 'T1.F5.01 expected 202 Accepted on timeout simulation');
      assertEq(res.body.draft.status, 'awaiting_confirmation', 'status awaiting_confirmation');
      assertNull(res.body.draft.pmsReference, 'pmsReference withheld from client');

      const dbDraft = ctx.db.getDraftById(draft.id);
      assertEq(dbDraft?.status, 'awaiting_confirmation');
      assertNull(dbDraft?.pms_reference);
    },
  },
  {
    id: 'T1.F5.02',
    name: 'PMS Record Persistence under Timeout Simulation',
    tier: 1,
    category: 'F5: Timeout Simulation & Verify',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F5-02');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} timeout check PMS`,
          patientRef: pRef,
          requestType: 'callback',
        })
      ).body;

      await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'callback' },
        { simulateTimeout: true }
      );

      // Verify PMS entry WAS recorded in SQLite
      const pmsEntry = ctx.db.getPmsEntry(draft.submissionId);
      assertDefined(pmsEntry, 'PMS row must exist in DB despite 202');
      assertEq(pmsEntry.status, 'saved');
      assertMatches(pmsEntry.pms_reference, /^PMS-\d{8}-\d+$/i);

      // Also verify through PMS status API
      const statusRes = await ctx.api.getPmsStatus(draft.submissionId);
      assertStatus(statusRes, 200);
      assertEq(statusRes.body.found, true);
    },
  },
  {
    id: 'T1.F5.03',
    name: 'Verify Endpoint Reconciles State to Confirmed',
    tier: 1,
    category: 'F5: Timeout Simulation & Verify',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F5-03');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} verify test`,
          patientRef: pRef,
          requestType: 'refill',
        })
      ).body;

      await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'refill' },
        { simulateTimeout: true }
      );

      const verifyRes = await ctx.api.verifyDraft(draft.id);
      assertStatus(verifyRes, 200, 'T1.F5.03 verify endpoint');
      assertEq(verifyRes.body.verified, true, 'verified true');
      assertEq(verifyRes.body.draft.status, 'confirmed', 'status confirmed');
      assertDefined(verifyRes.body.draft.pmsReference, 'pmsReference populated');

      const dbDraft = ctx.db.getDraftById(draft.id);
      assertEq(dbDraft?.status, 'confirmed');
      assertEq(dbDraft?.pms_reference, verifyRes.body.draft.pmsReference);
    },
  },
  {
    id: 'T1.F5.04',
    name: 'Reconcile Verification Populates Draft Updated Timestamp',
    tier: 1,
    category: 'F5: Timeout Simulation & Verify',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F5-04');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} timestamp check`,
          patientRef: pRef,
          requestType: 'callback',
        })
      ).body;

      await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'callback' },
        { simulateTimeout: true }
      );
      const beforeVerify = ctx.db.getDraftById(draft.id);
      const oldUpdatedAt = beforeVerify?.updated_at || '';

      await new Promise(r => setTimeout(r, 20));
      await ctx.api.verifyDraft(draft.id);

      const afterVerify = ctx.db.getDraftById(draft.id);
      assertDefined(afterVerify);
      assertEq(afterVerify.updated_at >= oldUpdatedAt, true, 'updated_at must advance or match');
    },
  },
  {
    id: 'T1.F5.05',
    name: 'Repeated Verify Call Idempotency',
    tier: 1,
    category: 'F5: Timeout Simulation & Verify',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F5-05');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} repeat verify`,
          patientRef: pRef,
          requestType: 'transfer',
        })
      ).body;

      await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'transfer' },
        { simulateTimeout: true }
      );

      const v1 = await ctx.api.verifyDraft(draft.id);
      assertStatus(v1, 200);

      const v2 = await ctx.api.verifyDraft(draft.id);
      assertStatus(v2, 200);
      assertEq(v2.body.verified, true);
      assertEq(v2.body.draft.status, 'confirmed');
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 1);
    },
  },
  {
    id: 'T1.F5.06',
    name: 'Post-Timeout Retry of Approve Route Remains Idempotent',
    tier: 1,
    category: 'F5: Timeout Simulation & Verify',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F5-06');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} post-timeout retry`,
          patientRef: pRef,
          requestType: 'callback',
        })
      ).body;

      await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'callback' },
        { simulateTimeout: true }
      );
      await ctx.api.verifyDraft(draft.id);

      const retryRes = await ctx.api.approveDraft(draft.id, {
        patientRef: pRef,
        requestType: 'callback',
      });
      assertStatus(retryRes, 200);
      assertEq(retryRes.body.draft.status, 'confirmed');
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 1, 'Only 1 PMS entry in DB');
    },
  },

  // =========================================================================
  // F6: Laminar Patient Profile View (6 tests)
  // =========================================================================
  {
    id: 'T1.F6.01',
    name: 'Query Patient Profile Returns Structure',
    tier: 1,
    category: 'F6: Laminar Patient Profile',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F6-01');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} profile structure test`,
          patientRef: pRef,
          requestType: 'callback',
          callbackPreference: 'after 3 p.m.',
        })
      ).body;
      await ctx.api.approveDraft(draft.id, { patientRef: pRef, requestType: 'callback' });

      const res = await ctx.api.getLaminarProfile(pRef);
      assertStatus(res, 200, 'T1.F6.01 profile query');
      assertEq(res.body.patientRef, pRef);
      assertDefined(res.body.entries);
      assertEq(res.body.entries.length >= 1, true);

      const entry = res.body.entries.find(e => e.draftId === draft.id);
      assertDefined(entry, 'Entry matching draftId found in profile');
      assertEq(entry.status, 'confirmed');
      assertDefined(entry.pmsReference);
    },
  },
  {
    id: 'T1.F6.02',
    name: 'Profile Reflection of Entry in draft Status',
    tier: 1,
    category: 'F6: Laminar Patient Profile',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F6-02');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} draft status note`,
          patientRef: pRef,
          requestType: 'refill',
        })
      ).body;

      const res = await ctx.api.getLaminarProfile(pRef);
      assertStatus(res, 200);
      const entry = res.body.entries.find(e => e.draftId === draft.id);
      assertDefined(entry);
      assertEq(entry.status, 'draft', 'status draft in profile');
      assertNull(entry.pmsReference, 'pmsReference null for draft');
    },
  },
  {
    id: 'T1.F6.03',
    name: 'Profile Reflection of Entry in awaiting_confirmation Status',
    tier: 1,
    category: 'F6: Laminar Patient Profile',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F6-03');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} timeout status note`,
          patientRef: pRef,
          requestType: 'transfer',
        })
      ).body;

      await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'transfer' },
        { simulateTimeout: true }
      );

      const res = await ctx.api.getLaminarProfile(pRef);
      assertStatus(res, 200);
      const entry = res.body.entries.find(e => e.draftId === draft.id);
      assertDefined(entry);
      assertEq(entry.status, 'awaiting_confirmation', 'status awaiting_confirmation in profile');
      assertNull(entry.pmsReference);
    },
  },
  {
    id: 'T1.F6.04',
    name: 'Profile Reflection of Entry Transition from Awaiting to Confirmed',
    tier: 1,
    category: 'F6: Laminar Patient Profile',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F6-04');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} transition note`,
          patientRef: pRef,
          requestType: 'callback',
        })
      ).body;

      await ctx.api.approveDraft(
        draft.id,
        { patientRef: pRef, requestType: 'callback' },
        { simulateTimeout: true }
      );
      const prof1 = await ctx.api.getLaminarProfile(pRef);
      assertEq(prof1.body.entries.find(e => e.draftId === draft.id)?.status, 'awaiting_confirmation');

      await ctx.api.verifyDraft(draft.id);

      const prof2 = await ctx.api.getLaminarProfile(pRef);
      const entry2 = prof2.body.entries.find(e => e.draftId === draft.id);
      assertEq(entry2?.status, 'confirmed', 'Profile transitions to confirmed');
      assertDefined(entry2?.pmsReference, 'pmsReference is populated');
    },
  },
  {
    id: 'T1.F6.05',
    name: 'Chronological Ordering of Multiple Submissions for Same Patient',
    tier: 1,
    category: 'F6: Laminar Patient Profile',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T1-F6-05');
      const d1 = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} first intake`,
          patientRef: pRef,
          requestType: 'callback',
        })
      ).body;

      await new Promise(r => setTimeout(r, 20));

      const d2 = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} second intake`,
          patientRef: pRef,
          requestType: 'refill',
        })
      ).body;

      const profile = await ctx.api.getLaminarProfile(pRef);
      assertStatus(profile, 200);
      assertEq(profile.body.entries.length >= 2, true);

      // Verify descending order
      const idx1 = profile.body.entries.findIndex(e => e.draftId === d1.id);
      const idx2 = profile.body.entries.findIndex(e => e.draftId === d2.id);
      assertEq(idx2 < idx1, true, 'Newer intake (d2) must precede older intake (d1)');
    },
  },
  {
    id: 'T1.F6.06',
    name: 'Patient Data Isolation',
    tier: 1,
    category: 'F6: Laminar Patient Profile',
    fn: async (ctx: TestContext) => {
      const pA = ctx.generatePatientRef('T1-F6-06A');
      const pB = ctx.generatePatientRef('T1-F6-06B');

      await ctx.api.createDraft({
        rawNote: `Patient ${pA} isolated note`,
        patientRef: pA,
        requestType: 'callback',
      });
      await ctx.api.createDraft({
        rawNote: `Patient ${pB} isolated note`,
        patientRef: pB,
        requestType: 'refill',
      });

      const profA = await ctx.api.getLaminarProfile(pA);
      const profB = await ctx.api.getLaminarProfile(pB);

      assertEq(profA.body.patientRef, pA);
      assertEq(profB.body.patientRef, pB);

      // Ensure no crossover
      for (const entry of profA.body.entries) {
        const row = ctx.db.getDraftById(entry.draftId);
        assertEq(row?.patient_ref, pA, 'No patient B leakage in profile A');
      }
    },
  },
];
