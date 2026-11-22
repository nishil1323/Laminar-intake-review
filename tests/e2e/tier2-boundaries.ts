import { TestCase, TestContext } from './types';
import {
  assertEq,
  assertDefined,
  assertNull,
  assertStatus,
  assertDbCount,
} from './helpers/assertions';

export const tier2Tests: TestCase[] = [
  // =========================================================================
  // Tier 2: Boundary & Corner Cases (15 tests: B1 to B15)
  // =========================================================================
  {
    id: 'T2.B.01',
    name: 'Empty Note Input Extraction',
    tier: 2,
    category: 'Boundary: Input Robustness',
    fn: async (ctx: TestContext) => {
      const res = await ctx.api.extract('');
      // Either 200 with null fields or 400 if empty notes are rejected
      assertStatus(res, [200, 400], 'T2.B.01 empty note');
      if (res.status === 200) {
        assertNull(res.body.patientRef);
        assertNull(res.body.requestType);
        assertNull(res.body.callbackPreference);
      }
    },
  },
  {
    id: 'T2.B.02',
    name: 'Massive Note Input (>25,000 characters) - ReDoS & Memory Bounds',
    tier: 2,
    category: 'Boundary: Resource & Stress',
    fn: async (ctx: TestContext) => {
      const padding = 'Routine pharmacy notes and standard log text. '.repeat(600); // ~28,000 chars
      const pRef = ctx.generatePatientRef('T2-B02');
      const massiveNote = `${padding}\nPatient ${pRef} requests a callback. Best time is after 3 p.m.`;

      const start = performance.now();
      const res = await ctx.api.extract(massiveNote);
      const elapsed = performance.now() - start;

      assertStatus(res, 200, 'T2.B.02 massive note extraction');
      assertEq(elapsed < 200, true, `Extraction took ${elapsed.toFixed(1)}ms (must be < 200ms)`);
      assertEq(res.body.patientRef, pRef);
      assertEq(res.body.requestType, 'callback');
      assertEq(res.body.callbackPreference, 'after 3 p.m.');
    },
  },
  {
    id: 'T2.B.03',
    name: 'SQL Injection Attempt in Raw Note and Patient Ref',
    tier: 2,
    category: 'Boundary: Security & Sanitization',
    fn: async (ctx: TestContext) => {
      const sqlInjectionPayload = "DEMO-999'); DROP TABLE drafts;--";
      const res = await ctx.api.createDraft({
        rawNote: `Patient ${sqlInjectionPayload} requests a callback.`,
        patientRef: sqlInjectionPayload,
        requestType: 'callback',
        callbackPreference: 'now',
      });

      assertStatus(res, [200, 201], 'T2.B.03 SQL injection creation');

      // Verify drafts table is still intact and unaffected
      assertEq(ctx.db.tableExists('drafts'), true, 'Table drafts must not be dropped');
      assertEq(ctx.db.tableExists('pms_entries'), true, 'Table pms_entries must not be dropped');

      const row = ctx.db.getDraftById(res.body.id);
      assertDefined(row, 'Row was safely persisted via parameterized query');
      assertEq(row.patient_ref, sqlInjectionPayload, 'Stored literal string safely');
    },
  },
  {
    id: 'T2.B.04',
    name: 'Stored XSS Script Payloads in Note and Fields',
    tier: 2,
    category: 'Boundary: Security & Sanitization',
    fn: async (ctx: TestContext) => {
      const xssPayload = "<script>alert('xss-test')</script>";
      const imgXss = '<img src=x onerror="alert(1)">';

      const res = await ctx.api.createDraft({
        rawNote: xssPayload,
        patientRef: 'DEMO-XSS',
        requestType: 'callback',
        callbackPreference: imgXss,
      });

      assertStatus(res, [200, 201], 'T2.B.04 stored XSS creation');
      const row = ctx.db.getDraftById(res.body.id);
      assertDefined(row);
      assertEq(row.raw_note, xssPayload, 'Payload preserved literally in DB');
      assertEq(row.callback_preference, imgXss, 'Payload preserved literally in DB');
    },
  },
  {
    id: 'T2.B.05',
    name: 'Draft Retrieval with Non-Existent UUID',
    tier: 2,
    category: 'Boundary: Negative Testing',
    fn: async (ctx: TestContext) => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await ctx.api.getDraft(fakeUuid);
      assertStatus(res, 404, 'T2.B.05 non-existent draft ID must return 404');
    },
  },
  {
    id: 'T2.B.06',
    name: 'Approve Endpoint with Non-Existent Draft ID',
    tier: 2,
    category: 'Boundary: Negative Testing',
    fn: async (ctx: TestContext) => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await ctx.api.approveDraft(fakeUuid, {
        patientRef: 'DEMO-101',
        requestType: 'callback',
      });
      assertStatus(res, 404, 'T2.B.06 non-existent draft approve must return 404');
    },
  },
  {
    id: 'T2.B.07',
    name: 'Verify Endpoint with Non-Existent Draft ID',
    tier: 2,
    category: 'Boundary: Negative Testing',
    fn: async (ctx: TestContext) => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await ctx.api.verifyDraft(fakeUuid);
      assertStatus(res, 404, 'T2.B.07 non-existent draft verify must return 404');
    },
  },
  {
    id: 'T2.B.08',
    name: 'PMS Status Lookup for Unknown Submission ID',
    tier: 2,
    category: 'Boundary: Negative Testing',
    fn: async (ctx: TestContext) => {
      const fakeSubId = '00000000-0000-0000-0000-000000000000';
      const res = await ctx.api.getPmsStatus(fakeSubId);
      assertStatus(res, [200, 404], 'T2.B.08 unknown PMS status lookup');
      if (res.status === 200) {
        assertEq(res.body.found, false, 'found must be false');
      }
    },
  },
  {
    id: 'T2.B.09',
    name: 'Malformed JSON Request Body Syntax',
    tier: 2,
    category: 'Boundary: Error Handling',
    fn: async (ctx: TestContext) => {
      const malformedBody = '{ patientRef: "DEMO-101", unclosed...';
      const res = await ctx.api.raw('POST', '/api/drafts', malformedBody);
      // Malformed JSON should yield 400 Bad Request, never a 500 crash
      assertStatus(res, 400, 'T2.B.09 malformed JSON must return 400');
    },
  },
  {
    id: 'T2.B.10',
    name: 'Invalid Data Types in Request Payload (Type Guarding)',
    tier: 2,
    category: 'Boundary: Type Safety',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T2-B10');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} note`,
          patientRef: pRef,
          requestType: 'callback',
        })
      ).body;

      const badPayload = {
        patientRef: 12345, // Number instead of string
        requestType: ['callback', 'urgent'], // Array instead of string
        callbackPreference: { time: 'noon' }, // Object instead of string
      };

      const res = await ctx.api.approveDraft(draft.id, badPayload);
      assertStatus(res, 400, 'T2.B.10 invalid data types rejected with 400');
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 0, 'No PMS entry on invalid types');
    },
  },
  {
    id: 'T2.B.11',
    name: 'Querying Laminar Profile for Non-Existent Patient',
    tier: 2,
    category: 'Boundary: Edge Conditions',
    fn: async (ctx: TestContext) => {
      const unknownPatientRef = 'NONEXISTENT-PATIENT-9999';
      const res = await ctx.api.getLaminarProfile(unknownPatientRef);

      assertStatus(res, 200, 'T2.B.11 non-existent patient returns 200 with empty list');
      assertEq(res.body.patientRef, unknownPatientRef);
      assertDefined(res.body.entries);
      assertEq(res.body.entries.length, 0, 'Entries must be empty array');
    },
  },
  {
    id: 'T2.B.12',
    name: 'Non-UUID Format in Path Parameters',
    tier: 2,
    category: 'Boundary: URL & Routing',
    fn: async (ctx: TestContext) => {
      const invalidPath = '/api/drafts/not-a-valid-uuid-format/approve';
      const res = await ctx.api.raw('POST', invalidPath, {
        patientRef: 'DEMO-101',
        requestType: 'callback',
      });

      assertStatus(res, [400, 404], 'T2.B.12 non-UUID path param handled gracefully');
    },
  },
  {
    id: 'T2.B.13',
    name: 'Verify Endpoint on Unsubmitted Draft',
    tier: 2,
    category: 'Boundary: State Safety',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T2-B13');
      const draft = (
        await ctx.api.createDraft({
          rawNote: `Patient ${pRef} fresh unsubmitted`,
          patientRef: pRef,
          requestType: 'callback',
        })
      ).body;

      const res = await ctx.api.verifyDraft(draft.id);
      assertStatus(res, [200, 400], 'T2.B.13 verify unsubmitted draft');
      if (res.status === 200) {
        assertEq(res.body.verified, false, 'verified must be false');
      }

      const dbDraft = ctx.db.getDraftById(draft.id);
      assertEq(dbDraft?.status, 'draft', 'status remains draft');
      assertNull(dbDraft?.pms_reference, 'pms_reference remains null');
      assertDbCount(ctx.db.countPmsEntries(draft.submissionId), 0);
    },
  },
  {
    id: 'T2.B.14',
    name: 'Request Payload with Excess / Unexpected Properties (Payload Pollution)',
    tier: 2,
    category: 'Boundary: Security & Sanitization',
    fn: async (ctx: TestContext) => {
      const pRef = ctx.generatePatientRef('T2-B14');
      const maliciousPayload = {
        rawNote: `Patient ${pRef} note`,
        patientRef: pRef,
        requestType: 'callback',
        isAdmin: true,
        overrideStatus: 'confirmed',
        fakePmsRef: 'PMS-HACK-OVERRIDE',
        status: 'confirmed',
      };

      const res = await ctx.api.createDraft(maliciousPayload);
      assertStatus(res, [200, 201], 'T2.B.14 creation with excess properties');
      assertEq(res.body.status, 'draft', 'Status cannot be overridden to confirmed');
      assertNull(res.body.pmsReference, 'pmsReference cannot be injected');

      const row = ctx.db.getDraftById(res.body.id);
      assertEq(row?.status, 'draft', 'DB status remains draft');
      assertNull(row?.pms_reference, 'DB pms_reference remains null');
    },
  },
  {
    id: 'T2.B.15',
    name: 'Multibyte Unicode and Emoji Ingestion',
    tier: 2,
    category: 'Boundary: Encoding & Character Sets',
    fn: async (ctx: TestContext) => {
      const pRef = '💊-DEMO-Unicode';
      const note = `Patient ${pRef} requests refill 💉. Best time ⏰ is afternoon.`;
      const res = await ctx.api.createDraft({
        rawNote: note,
        patientRef: pRef,
        requestType: 'refill',
        callbackPreference: 'afternoon ⏰',
      });

      assertStatus(res, [200, 201], 'T2.B.15 unicode draft creation');
      assertEq(res.body.patientRef, pRef);
      assertEq(res.body.callbackPreference, 'afternoon ⏰');

      const row = ctx.db.getDraftById(res.body.id);
      assertDefined(row);
      assertEq(row.patient_ref, pRef, 'SQLite preserves UTF-8 emoji strings');
      assertEq(row.callback_preference, 'afternoon ⏰', 'SQLite preserves UTF-8 emoji strings');
    },
  },
];
