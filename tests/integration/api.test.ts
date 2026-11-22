import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { getDb, closeDb } from '../../lib/db';
import { POST as extractRoute } from '../../app/api/extract/route';
import { POST as createDraftRoute } from '../../app/api/drafts/route';
import { GET as getDraftRoute } from '../../app/api/drafts/[id]/route';
import { POST as approveDraftRoute } from '../../app/api/drafts/[id]/approve/route';
import { POST as verifyDraftRoute } from '../../app/api/drafts/[id]/verify/route';
import { POST as submitPmsRoute } from '../../app/api/pms/submit/route';
import { GET as getPmsStatusRoute } from '../../app/api/pms/status/[submissionId]/route';
import { GET as getLaminarProfileRoute } from '../../app/api/laminar/[patientRef]/route';

function createJsonRequest(url: string, body?: any, headers: Record<string, string> = {}): Request {
  const reqHeaders = new Headers(headers);
  let reqBody: string | undefined = undefined;

  if (body !== undefined) {
    if (typeof body === 'string') {
      reqBody = body;
    } else {
      reqBody = JSON.stringify(body);
      if (!reqHeaders.has('content-type')) {
        reqHeaders.set('content-type', 'application/json');
      }
    }
  }

  return new Request(url, {
    method: 'POST',
    headers: reqHeaders,
    body: reqBody,
  });
}

function createGetRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'GET',
    headers: new Headers(headers),
  });
}

describe('Milestone 2 API Route Endpoints Integration Suite', () => {
  before(() => {
    getDb();
  });

  after(async () => {
    closeDb();
    try {
      const v8 = require('v8');
      const vm = require('vm');
      v8.setFlagsFromString('--expose_gc');
      const gc = vm.runInNewContext('gc');
      if (typeof gc === 'function') {
        for (let i = 0; i < 5; i++) {
          gc();
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // 1. POST /api/extract
  // =========================================================================
  describe('POST /api/extract', () => {
    it('successfully extracts Sample 1 note (complete note)', async () => {
      const note = 'Patient DEMO-101 requests a callback. Best time is after 3 p.m.';
      const req = createJsonRequest('http://localhost:3000/api/extract', { note });
      const res = await extractRoute(req);

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.patientRef, 'DEMO-101');
      assert.strictEqual(data.requestType, 'callback');
      assert.strictEqual(data.callbackPreference, 'after 3 p.m.');
      assert.strictEqual(data.rawNote, note);
    });

    it('successfully extracts Sample 2 note (missing patient reference)', async () => {
      const note = 'Caller asks for a prescription refill for lisinopril. Prefers morning callback.';
      const req = createJsonRequest('http://localhost:3000/api/extract', { note });
      const res = await extractRoute(req);

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.patientRef, null);
      assert.strictEqual(data.requestType, 'refill');
      assert.strictEqual(data.callbackPreference, 'morning');
      assert.strictEqual(data.rawNote, note);
    });

    it('handles empty note string by returning null fields', async () => {
      const req = createJsonRequest('http://localhost:3000/api/extract', { note: '' });
      const res = await extractRoute(req);

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.patientRef, null);
      assert.strictEqual(data.requestType, null);
      assert.strictEqual(data.callbackPreference, null);
      assert.strictEqual(data.rawNote, '');
    });

    it('returns 400 when note field is missing or empty object', async () => {
      const req = createJsonRequest('http://localhost:3000/api/extract', {});
      const res = await extractRoute(req);

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'Note text is required');
    });

    it('returns 400 when note field is non-string', async () => {
      const req = createJsonRequest('http://localhost:3000/api/extract', { note: 12345 });
      const res = await extractRoute(req);

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'Note text is required');
    });

    it('returns 400 when empty body is sent', async () => {
      const req = createJsonRequest('http://localhost:3000/api/extract', '');
      const res = await extractRoute(req);

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'Note text is required');
    });

    it('returns 400 on malformed JSON body', async () => {
      const req = createJsonRequest('http://localhost:3000/api/extract', '{ note: "unclosed...');
      const res = await extractRoute(req);

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'Invalid JSON body');
    });
  });

  // =========================================================================
  // 2. POST /api/drafts
  // =========================================================================
  describe('POST /api/drafts', () => {
    it('creates draft with generated distinct UUIDs and default status draft', async () => {
      const payload = {
        rawNote: 'Patient DEMO-201 requests callback. Best time is afternoon.',
        patientRef: 'DEMO-201',
        requestType: 'callback',
        callbackPreference: 'afternoon',
      };
      const req = createJsonRequest('http://localhost:3000/api/drafts', payload);
      const res = await createDraftRoute(req);

      assert.strictEqual(res.status, 201);
      const draft = await res.json();
      assert.ok(draft.id, 'Draft id must be defined');
      assert.ok(draft.submissionId, 'Draft submissionId must be defined');
      assert.notStrictEqual(draft.id, draft.submissionId, 'id and submissionId must be distinct');
      assert.match(
        draft.id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      assert.match(
        draft.submissionId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      assert.strictEqual(draft.patientRef, 'DEMO-201');
      assert.strictEqual(draft.requestType, 'callback');
      assert.strictEqual(draft.callbackPreference, 'afternoon');
      assert.strictEqual(draft.status, 'draft');
      assert.strictEqual(draft.pmsReference, null);
    });

    it('creates draft with null patientRef for incomplete notes', async () => {
      const payload = {
        rawNote: 'Caller asks for refill. Morning callback.',
        patientRef: null,
        requestType: 'refill',
        callbackPreference: 'morning',
      };
      const req = createJsonRequest('http://localhost:3000/api/drafts', payload);
      const res = await createDraftRoute(req);

      assert.strictEqual(res.status, 201);
      const draft = await res.json();
      assert.strictEqual(draft.patientRef, null);
      assert.strictEqual(draft.requestType, 'refill');
      assert.strictEqual(draft.status, 'draft');
    });

    it('returns 400 when rawNote is missing', async () => {
      const payload = {
        patientRef: 'DEMO-202',
        requestType: 'callback',
      };
      const req = createJsonRequest('http://localhost:3000/api/drafts', payload);
      const res = await createDraftRoute(req);

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'rawNote is required');
    });

    it('returns 400 on malformed JSON request body', async () => {
      const req = createJsonRequest('http://localhost:3000/api/drafts', '{ badJson: ...');
      const res = await createDraftRoute(req);

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'Invalid JSON request body');
    });

    it('defends against payload pollution (rejects injected status, id, and pmsReference)', async () => {
      const maliciousPayload = {
        rawNote: 'Patient DEMO-HACK injection test',
        patientRef: 'DEMO-HACK',
        requestType: 'callback',
        id: '00000000-0000-0000-0000-000000000000',
        submissionId: '11111111-1111-1111-1111-111111111111',
        status: 'confirmed',
        pmsReference: 'PMS-OVERRIDE-HACK',
        isAdmin: true,
      };
      const req = createJsonRequest('http://localhost:3000/api/drafts', maliciousPayload);
      const res = await createDraftRoute(req);

      assert.strictEqual(res.status, 201);
      const draft = await res.json();
      assert.notStrictEqual(draft.id, '00000000-0000-0000-0000-000000000000');
      assert.notStrictEqual(draft.submissionId, '11111111-1111-1111-1111-111111111111');
      assert.strictEqual(draft.status, 'draft', 'Status must always initialize to draft');
      assert.strictEqual(draft.pmsReference, null, 'pmsReference must always initialize to null');
    });
  });

  // =========================================================================
  // 3. GET /api/drafts/[id]
  // =========================================================================
  describe('GET /api/drafts/[id]', () => {
    it('returns 200 with Draft object for existing draft', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-301 retrieval test',
        patientRef: 'DEMO-301',
        requestType: 'refill',
      });
      const createRes = await createDraftRoute(createReq);
      const created = await createRes.json();

      const getReq = createGetRequest(`http://localhost:3000/api/drafts/${created.id}`);
      const getRes = await getDraftRoute(getReq, { params: { id: created.id } });

      assert.strictEqual(getRes.status, 200);
      const fetched = await getRes.json();
      assert.strictEqual(fetched.id, created.id);
      assert.strictEqual(fetched.submissionId, created.submissionId);
      assert.strictEqual(fetched.patientRef, 'DEMO-301');
      assert.strictEqual(fetched.requestType, 'refill');
      assert.strictEqual(fetched.status, 'draft');
    });

    it('returns 404 for non-existent draft UUID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const getReq = createGetRequest(`http://localhost:3000/api/drafts/${nonExistentId}`);
      const getRes = await getDraftRoute(getReq, { params: { id: nonExistentId } });

      assert.strictEqual(getRes.status, 404);
      const data = await getRes.json();
      assert.strictEqual(data.error, 'Draft not found');
    });

    it('returns 404 for arbitrary non-UUID draft id', async () => {
      const invalidId = 'not-a-valid-uuid';
      const getReq = createGetRequest(`http://localhost:3000/api/drafts/${invalidId}`);
      const getRes = await getDraftRoute(getReq, { params: { id: invalidId } });

      assert.strictEqual(getRes.status, 404);
      const data = await getRes.json();
      assert.strictEqual(data.error, 'Draft not found');
    });
  });

  // =========================================================================
  // 4. POST /api/drafts/[id]/approve
  // =========================================================================
  describe('POST /api/drafts/[id]/approve', () => {
    it('approves draft on happy path, returning 200, confirmed status, and pmsResult', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-401 requests callback',
        patientRef: 'DEMO-401',
        requestType: 'callback',
        callbackPreference: 'after 3 p.m.',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const approveReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/approve`,
        {
          patientRef: 'DEMO-401',
          requestType: 'callback',
          callbackPreference: 'after 3 p.m.',
        }
      );
      const approveRes = await approveDraftRoute(approveReq, { params: { id: created.id } });

      assert.strictEqual(approveRes.status, 200);
      const body = await approveRes.json();
      assert.strictEqual(body.draft.id, created.id);
      assert.strictEqual(body.draft.status, 'confirmed');
      assert.ok(body.draft.pmsReference);
      assert.match(body.draft.pmsReference, /^PMS-\d{8}-\d+$/);
      assert.strictEqual(body.pmsResult.status, 'saved');
      assert.strictEqual(body.pmsResult.pmsReference, body.draft.pmsReference);
      assert.strictEqual(body.pmsResult.submissionId, created.submissionId);
    });

    it('updates edited fields in both draft and PMS entry during approval', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-402 requests callback',
        patientRef: 'DEMO-402',
        requestType: 'callback',
        callbackPreference: 'morning',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const approveReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/approve`,
        {
          patientRef: 'DEMO-402',
          requestType: 'callback',
          callbackPreference: 'after 5 p.m.', // edited time
        }
      );
      const approveRes = await approveDraftRoute(approveReq, { params: { id: created.id } });

      assert.strictEqual(approveRes.status, 200);
      const body = await approveRes.json();
      assert.strictEqual(body.draft.callbackPreference, 'after 5 p.m.');
      assert.strictEqual(body.pmsResult.callbackPreference, 'after 5 p.m.');
    });

    it('handles simulated timeout via X-Simulate-Timeout header returning 202 and awaiting_confirmation', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-403 timeout test',
        patientRef: 'DEMO-403',
        requestType: 'refill',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const approveReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/approve`,
        {
          patientRef: 'DEMO-403',
          requestType: 'refill',
        },
        { 'x-simulate-timeout': 'true' }
      );
      const approveRes = await approveDraftRoute(approveReq, { params: { id: created.id } });

      assert.strictEqual(approveRes.status, 202);
      const body = await approveRes.json();
      assert.strictEqual(body.draft.status, 'awaiting_confirmation');
      assert.strictEqual(body.draft.pmsReference, null);
      assert.ok(body.message.includes('timed out'));

      // PMS entry was still saved
      const pmsStatusReq = createGetRequest(
        `http://localhost:3000/api/pms/status/${created.submissionId}`
      );
      const pmsStatusRes = await getPmsStatusRoute(pmsStatusReq, {
        params: { submissionId: created.submissionId },
      });
      const pmsStatus = await pmsStatusRes.json();
      assert.strictEqual(pmsStatus.found, true);
      assert.strictEqual(pmsStatus.entry.submissionId, created.submissionId);
    });

    it('handles simulated timeout via body flag simulateTimeout: true', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-404 body timeout flag test',
        patientRef: 'DEMO-404',
        requestType: 'transfer',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const approveReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/approve`,
        {
          patientRef: 'DEMO-404',
          requestType: 'transfer',
          simulateTimeout: true,
        }
      );
      const approveRes = await approveDraftRoute(approveReq, { params: { id: created.id } });

      assert.strictEqual(approveRes.status, 202);
      const body = await approveRes.json();
      assert.strictEqual(body.draft.status, 'awaiting_confirmation');
    });

    it('rejects approval with 400 when patientRef is missing or null (zero PMS writes)', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Incomplete note without patient ref',
        patientRef: null,
        requestType: 'refill',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const approveReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/approve`,
        {
          patientRef: null,
          requestType: 'refill',
        }
      );
      const approveRes = await approveDraftRoute(approveReq, { params: { id: created.id } });

      assert.strictEqual(approveRes.status, 400);
      const body = await approveRes.json();
      assert.ok(body.errors.includes('Patient reference is required'));

      // Verify no PMS record was created
      const statusRes = await getPmsStatusRoute(
        createGetRequest(`http://localhost:3000/api/pms/status/${created.submissionId}`),
        { params: { submissionId: created.submissionId } }
      );
      const statusBody = await statusRes.json();
      assert.strictEqual(statusBody.found, false);
    });

    it('rejects approval with 400 when requestType is missing or whitespace', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-405 note',
        patientRef: 'DEMO-405',
        requestType: 'callback',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const approveReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/approve`,
        {
          patientRef: 'DEMO-405',
          requestType: '   \t  ',
        }
      );
      const approveRes = await approveDraftRoute(approveReq, { params: { id: created.id } });

      assert.strictEqual(approveRes.status, 400);
      const body = await approveRes.json();
      assert.ok(body.errors.includes('Request type is required'));
    });

    it('rejects approval with 400 when both patientRef and requestType are missing', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Note text',
        patientRef: 'DEMO-406',
        requestType: 'callback',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const approveReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/approve`,
        {}
      );
      const approveRes = await approveDraftRoute(approveReq, { params: { id: created.id } });

      assert.strictEqual(approveRes.status, 400);
      const body = await approveRes.json();
      assert.strictEqual(body.errors.length, 2);
      assert.ok(body.errors.includes('Patient reference is required'));
      assert.ok(body.errors.includes('Request type is required'));
    });

    it('returns 404 when approving non-existent draft ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const approveReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${fakeId}/approve`,
        {
          patientRef: 'DEMO-999',
          requestType: 'callback',
        }
      );
      const approveRes = await approveDraftRoute(approveReq, { params: { id: fakeId } });

      assert.strictEqual(approveRes.status, 404);
      const body = await approveRes.json();
      assert.strictEqual(body.error, 'Draft not found');
    });

    it('returns 400 when approval request body has malformed JSON syntax', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-407 note',
        patientRef: 'DEMO-407',
        requestType: 'callback',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const approveReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/approve`,
        '{ malformed: "json...'
      );
      const approveRes = await approveDraftRoute(approveReq, { params: { id: created.id } });

      assert.strictEqual(approveRes.status, 400);
      const body = await approveRes.json();
      assert.strictEqual(body.error, 'Invalid JSON request body');
    });

    it('idempotently handles repeated approval on already confirmed draft without duplicate PMS rows', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-408 retry approval test',
        patientRef: 'DEMO-408',
        requestType: 'callback',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const app1 = await approveDraftRoute(
        createJsonRequest(`http://localhost:3000/api/drafts/${created.id}/approve`, {
          patientRef: 'DEMO-408',
          requestType: 'callback',
        }),
        { params: { id: created.id } }
      );
      assert.strictEqual(app1.status, 200);
      const body1 = await app1.json();

      // Second approval call (simulating network retry / double click)
      const app2 = await approveDraftRoute(
        createJsonRequest(`http://localhost:3000/api/drafts/${created.id}/approve`, {
          patientRef: 'DEMO-408',
          requestType: 'callback',
        }),
        { params: { id: created.id } }
      );
      assert.strictEqual(app2.status, 200);
      const body2 = await app2.json();

      assert.strictEqual(body2.draft.status, 'confirmed');
      assert.strictEqual(body2.draft.pmsReference, body1.draft.pmsReference);
      assert.strictEqual(body2.pmsResult.pmsReference, body1.pmsResult.pmsReference);
    });
  });

  // =========================================================================
  // 5. POST /api/drafts/[id]/verify
  // =========================================================================
  describe('POST /api/drafts/[id]/verify', () => {
    it('reconciles awaiting_confirmation draft to confirmed with pmsReference and verified: true', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-501 verify reconciliation',
        patientRef: 'DEMO-501',
        requestType: 'callback',
      });
      const created = await (await createDraftRoute(createReq)).json();

      // Approve with timeout simulation
      await approveDraftRoute(
        createJsonRequest(
          `http://localhost:3000/api/drafts/${created.id}/approve`,
          { patientRef: 'DEMO-501', requestType: 'callback' },
          { 'x-simulate-timeout': 'true' }
        ),
        { params: { id: created.id } }
      );

      // Verify draft
      const verifyReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/verify`
      );
      const verifyRes = await verifyDraftRoute(verifyReq, { params: { id: created.id } });

      assert.strictEqual(verifyRes.status, 200);
      const body = await verifyRes.json();
      assert.strictEqual(body.verified, true);
      assert.strictEqual(body.draft.status, 'confirmed');
      assert.ok(body.draft.pmsReference);
      assert.ok(body.pmsEntry);
      assert.strictEqual(body.pmsEntry.submissionId, created.submissionId);
      assert.strictEqual(body.draft.pmsReference, body.pmsEntry.pmsReference);
    });

    it('returns verified: false when draft has not been submitted to PMS', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-502 unsubmitted draft',
        patientRef: 'DEMO-502',
        requestType: 'refill',
      });
      const created = await (await createDraftRoute(createReq)).json();

      const verifyReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${created.id}/verify`
      );
      const verifyRes = await verifyDraftRoute(verifyReq, { params: { id: created.id } });

      assert.strictEqual(verifyRes.status, 200);
      const body = await verifyRes.json();
      assert.strictEqual(body.verified, false);
      assert.strictEqual(body.draft.status, 'draft');
      assert.strictEqual(body.pmsEntry, null);
    });

    it('returns 404 when verifying non-existent draft ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const verifyReq = createJsonRequest(
        `http://localhost:3000/api/drafts/${fakeId}/verify`
      );
      const verifyRes = await verifyDraftRoute(verifyReq, { params: { id: fakeId } });

      assert.strictEqual(verifyRes.status, 404);
      const body = await verifyRes.json();
      assert.strictEqual(body.error, 'Draft not found');
    });

    it('idempotently handles repeated verify calls on confirmed draft', async () => {
      const createReq = createJsonRequest('http://localhost:3000/api/drafts', {
        rawNote: 'Patient DEMO-503 repeated verify test',
        patientRef: 'DEMO-503',
        requestType: 'callback',
      });
      const created = await (await createDraftRoute(createReq)).json();
      await approveDraftRoute(
        createJsonRequest(`http://localhost:3000/api/drafts/${created.id}/approve`, {
          patientRef: 'DEMO-503',
          requestType: 'callback',
        }),
        { params: { id: created.id } }
      );

      const v1 = await (
        await verifyDraftRoute(
          createJsonRequest(`http://localhost:3000/api/drafts/${created.id}/verify`),
          { params: { id: created.id } }
        )
      ).json();
      const v2 = await (
        await verifyDraftRoute(
          createJsonRequest(`http://localhost:3000/api/drafts/${created.id}/verify`),
          { params: { id: created.id } }
        )
      ).json();

      assert.strictEqual(v1.verified, true);
      assert.strictEqual(v2.verified, true);
      assert.strictEqual(v1.draft.pmsReference, v2.draft.pmsReference);
    });
  });

  // =========================================================================
  // 6. POST /api/pms/submit
  // =========================================================================
  describe('POST /api/pms/submit', () => {
    it('saves PMS entry and returns 200 with submissionId, pmsReference, and status saved', async () => {
      const subId = randomUUID();
      const payload = {
        submissionId: subId,
        patientRef: 'DEMO-601',
        requestType: 'callback',
        callbackPreference: 'after 3 p.m.',
      };
      const req = createJsonRequest('http://localhost:3000/api/pms/submit', payload);
      const res = await submitPmsRoute(req);

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.submissionId, subId);
      assert.strictEqual(body.status, 'saved');
      assert.ok(body.pmsReference);
      assert.match(body.pmsReference, /^PMS-\d{8}-\d+$/);
    });

    it('is strictly idempotent on duplicate submissionId submissions', async () => {
      const subId = randomUUID();
      const payload = {
        submissionId: subId,
        patientRef: 'DEMO-602',
        requestType: 'callback',
      };
      const res1 = await (
        await submitPmsRoute(createJsonRequest('http://localhost:3000/api/pms/submit', payload))
      ).json();
      const res2 = await (
        await submitPmsRoute(createJsonRequest('http://localhost:3000/api/pms/submit', payload))
      ).json();

      assert.strictEqual(res1.pmsReference, res2.pmsReference);
      assert.strictEqual(res1.submissionId, res2.submissionId);
    });

    it('returns 400 when required fields are missing', async () => {
      const req = createJsonRequest('http://localhost:3000/api/pms/submit', {
        submissionId: randomUUID(),
        // patientRef missing
        requestType: 'callback',
      });
      const res = await submitPmsRoute(req);

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(
        body.error,
        'submissionId, patientRef, and requestType are required'
      );
    });

    it('returns 400 on malformed JSON request body', async () => {
      const req = createJsonRequest('http://localhost:3000/api/pms/submit', '{ broken: JSON...');
      const res = await submitPmsRoute(req);

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'Invalid JSON request body');
    });
  });

  // =========================================================================
  // 7. GET /api/pms/status/[submissionId]
  // =========================================================================
  describe('GET /api/pms/status/[submissionId]', () => {
    it('returns found: true and entry for existing submissionId', async () => {
      const subId = randomUUID();
      await submitPmsRoute(
        createJsonRequest('http://localhost:3000/api/pms/submit', {
          submissionId: subId,
          patientRef: 'DEMO-701',
          requestType: 'refill',
        })
      );

      const req = createGetRequest(`http://localhost:3000/api/pms/status/${subId}`);
      const res = await getPmsStatusRoute(req, { params: { submissionId: subId } });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.found, true);
      assert.ok(body.entry);
      assert.strictEqual(body.entry.submissionId, subId);
      assert.strictEqual(body.entry.patientRef, 'DEMO-701');
    });

    it('returns found: false for unknown submissionId', async () => {
      const unknownSubId = '00000000-0000-0000-0000-000000000000';
      const req = createGetRequest(`http://localhost:3000/api/pms/status/${unknownSubId}`);
      const res = await getPmsStatusRoute(req, { params: { submissionId: unknownSubId } });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.found, false);
      assert.strictEqual(body.entry, undefined);
    });
  });

  // =========================================================================
  // 8. GET /api/laminar/[patientRef]
  // =========================================================================
  describe('GET /api/laminar/[patientRef]', () => {
    it('returns 200 with patientRef and entries list for patient with multiple drafts', async () => {
      const pRef = 'DEMO-801-' + randomUUID().slice(0, 8);
      // Create first draft
      const d1 = await (
        await createDraftRoute(
          createJsonRequest('http://localhost:3000/api/drafts', {
            rawNote: `Patient ${pRef} first request`,
            patientRef: pRef,
            requestType: 'callback',
          })
        )
      ).json();
      await approveDraftRoute(
        createJsonRequest(`http://localhost:3000/api/drafts/${d1.id}/approve`, {
          patientRef: pRef,
          requestType: 'callback',
        }),
        { params: { id: d1.id } }
      );

      // Create second draft
      const d2 = await (
        await createDraftRoute(
          createJsonRequest('http://localhost:3000/api/drafts', {
            rawNote: `Patient ${pRef} second request`,
            patientRef: pRef,
            requestType: 'refill',
          })
        )
      ).json();

      const req = createGetRequest(`http://localhost:3000/api/laminar/${pRef}`);
      const res = await getLaminarProfileRoute(req, { params: { patientRef: pRef } });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.patientRef, pRef);
      assert.strictEqual(body.entries.length, 2);

      const d1Entry = body.entries.find((e: any) => e.draftId === d1.id);
      const d2Entry = body.entries.find((e: any) => e.draftId === d2.id);

      assert.ok(d1Entry);
      assert.strictEqual(d1Entry.status, 'confirmed');
      assert.ok(d1Entry.pmsReference);

      assert.ok(d2Entry);
      assert.strictEqual(d2Entry.status, 'draft');
      assert.strictEqual(d2Entry.pmsReference, null);
    });

    it('returns 200 with empty entries array for non-existent patient (never 404)', async () => {
      const unknownPatientRef = 'NONEXISTENT-PATIENT-9999';
      const req = createGetRequest(`http://localhost:3000/api/laminar/${unknownPatientRef}`);
      const res = await getLaminarProfileRoute(req, {
        params: { patientRef: unknownPatientRef },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.patientRef, unknownPatientRef);
      assert.deepStrictEqual(body.entries, []);
    });

    it('safely handles URL-encoded unicode patient references (e.g. emojis)', async () => {
      const unicodePatientRef = '💊-DEMO-Unicode-' + randomUUID().slice(0, 8);
      const d = await (
        await createDraftRoute(
          createJsonRequest('http://localhost:3000/api/drafts', {
            rawNote: `Patient ${unicodePatientRef} unicode test`,
            patientRef: unicodePatientRef,
            requestType: 'refill',
          })
        )
      ).json();

      const encoded = encodeURIComponent(unicodePatientRef);
      const req = createGetRequest(`http://localhost:3000/api/laminar/${encoded}`);
      const res = await getLaminarProfileRoute(req, { params: { patientRef: encoded } });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.patientRef, unicodePatientRef);
      assert.strictEqual(body.entries.length, 1);
      assert.strictEqual(body.entries[0].draftId, d.id);
    });
  });

  // =========================================================================
  // 9. End-to-End Walkthrough of 3 Core Assignment Scenarios
  // =========================================================================
  describe('Full Scenarios Integration Walkthrough', () => {
    it('Scenario 1: Successful submission with field edit (Sample 1)', async () => {
      // Step 1: Stateless extraction
      const extractRes = await extractRoute(
        createJsonRequest('http://localhost:3000/api/extract', {
          note: 'Patient DEMO-101 requests a callback. Best time is after 3 p.m.',
        })
      );
      assert.strictEqual(extractRes.status, 200);
      const extracted = await extractRes.json();
      assert.strictEqual(extracted.patientRef, 'DEMO-101');
      assert.strictEqual(extracted.callbackPreference, 'after 3 p.m.');

      // Step 2: Create draft
      const draftRes = await createDraftRoute(
        createJsonRequest('http://localhost:3000/api/drafts', extracted)
      );
      assert.strictEqual(draftRes.status, 201);
      const draft = await draftRes.json();
      assert.strictEqual(draft.status, 'draft');

      // Step 3: Staff edits callback time to "after 4 p.m." and approves
      const approveRes = await approveDraftRoute(
        createJsonRequest(`http://localhost:3000/api/drafts/${draft.id}/approve`, {
          patientRef: 'DEMO-101',
          requestType: 'callback',
          callbackPreference: 'after 4 p.m.',
        }),
        { params: { id: draft.id } }
      );
      assert.strictEqual(approveRes.status, 200);
      const approved = await approveRes.json();
      assert.strictEqual(approved.draft.status, 'confirmed');
      assert.strictEqual(approved.draft.callbackPreference, 'after 4 p.m.');
      assert.ok(approved.draft.pmsReference);

      // Step 4: Laminar profile reflects confirmed entry
      const profileRes = await getLaminarProfileRoute(
        createGetRequest('http://localhost:3000/api/laminar/DEMO-101'),
        { params: { patientRef: 'DEMO-101' } }
      );
      assert.strictEqual(profileRes.status, 200);
      const profile = await profileRes.json();
      const entry = profile.entries.find((e: any) => e.draftId === draft.id);
      assert.ok(entry);
      assert.strictEqual(entry.status, 'confirmed');
      assert.strictEqual(entry.callbackPreference, 'after 4 p.m.');
      assert.strictEqual(entry.pmsReference, approved.draft.pmsReference);
    });

    it('Scenario 2: Missing required field blocks approval until supplied (Sample 2)', async () => {
      // Step 1: Extract incomplete note
      const extractRes = await extractRoute(
        createJsonRequest('http://localhost:3000/api/extract', {
          note: 'Caller asks for a prescription refill for lisinopril. Prefers morning callback.',
        })
      );
      assert.strictEqual(extractRes.status, 200);
      const extracted = await extractRes.json();
      assert.strictEqual(extracted.patientRef, null);

      // Step 2: Create draft
      const draftRes = await createDraftRoute(
        createJsonRequest('http://localhost:3000/api/drafts', extracted)
      );
      assert.strictEqual(draftRes.status, 201);
      const draft = await draftRes.json();
      assert.strictEqual(draft.patientRef, null);

      // Step 3: Approval attempt fails with 400
      const failedApproveRes = await approveDraftRoute(
        createJsonRequest(`http://localhost:3000/api/drafts/${draft.id}/approve`, {
          patientRef: null,
          requestType: 'refill',
          callbackPreference: 'morning',
        }),
        { params: { id: draft.id } }
      );
      assert.strictEqual(failedApproveRes.status, 400);
      const errorBody = await failedApproveRes.json();
      assert.ok(errorBody.errors.includes('Patient reference is required'));

      // PMS remains untouched
      const pmsStatusRes = await getPmsStatusRoute(
        createGetRequest(`http://localhost:3000/api/pms/status/${draft.submissionId}`),
        { params: { submissionId: draft.submissionId } }
      );
      assert.strictEqual((await pmsStatusRes.json()).found, false);

      // Step 4: Staff supplies missing patient reference and successfully approves
      const successApproveRes = await approveDraftRoute(
        createJsonRequest(`http://localhost:3000/api/drafts/${draft.id}/approve`, {
          patientRef: 'DEMO-102',
          requestType: 'refill',
          callbackPreference: 'morning',
        }),
        { params: { id: draft.id } }
      );
      assert.strictEqual(successApproveRes.status, 200);
      const approved = await successApproveRes.json();
      assert.strictEqual(approved.draft.patientRef, 'DEMO-102');
      assert.strictEqual(approved.draft.status, 'confirmed');

      // Step 5: Laminar profile for DEMO-102 shows confirmed entry
      const profileRes = await getLaminarProfileRoute(
        createGetRequest('http://localhost:3000/api/laminar/DEMO-102'),
        { params: { patientRef: 'DEMO-102' } }
      );
      const profile = await profileRes.json();
      assert.ok(profile.entries.some((e: any) => e.draftId === draft.id && e.status === 'confirmed'));
    });

    it('Scenario 3: PMS timeout recovery with verify and idempotent retry proof', async () => {
      // Step 1: Create draft
      const draftRes = await createDraftRoute(
        createJsonRequest('http://localhost:3000/api/drafts', {
          rawNote: 'Patient DEMO-103 requests callback. Best time is after 2 p.m.',
          patientRef: 'DEMO-103',
          requestType: 'callback',
          callbackPreference: 'after 2 p.m.',
        })
      );
      const draft = await draftRes.json();

      // Step 2: Approve with timeout simulation header -> returns 202
      const timeoutRes = await approveDraftRoute(
        createJsonRequest(
          `http://localhost:3000/api/drafts/${draft.id}/approve`,
          {
            patientRef: 'DEMO-103',
            requestType: 'callback',
            callbackPreference: 'after 2 p.m.',
          },
          { 'x-simulate-timeout': 'true' }
        ),
        { params: { id: draft.id } }
      );
      assert.strictEqual(timeoutRes.status, 202);
      const timeoutBody = await timeoutRes.json();
      assert.strictEqual(timeoutBody.draft.status, 'awaiting_confirmation');
      assert.strictEqual(timeoutBody.draft.pmsReference, null);

      // Step 3: Query PMS status directly -> prove PMS actually saved the entry
      const pmsStatusRes = await getPmsStatusRoute(
        createGetRequest(`http://localhost:3000/api/pms/status/${draft.submissionId}`),
        { params: { submissionId: draft.submissionId } }
      );
      const pmsStatus = await pmsStatusRes.json();
      assert.strictEqual(pmsStatus.found, true);
      const pmsReference = pmsStatus.entry.pmsReference;
      assert.ok(pmsReference);

      // Step 4: Laminar profile shows awaiting_confirmation before verify
      const profileBefore = await (
        await getLaminarProfileRoute(
          createGetRequest('http://localhost:3000/api/laminar/DEMO-103'),
          { params: { patientRef: 'DEMO-103' } }
        )
      ).json();
      const entryBefore = profileBefore.entries.find((e: any) => e.draftId === draft.id);
      assert.strictEqual(entryBefore.status, 'awaiting_confirmation');
      assert.strictEqual(entryBefore.pmsReference, null);

      // Step 5: Verify endpoint reconciles draft
      const verifyRes = await verifyDraftRoute(
        createJsonRequest(`http://localhost:3000/api/drafts/${draft.id}/verify`),
        { params: { id: draft.id } }
      );
      assert.strictEqual(verifyRes.status, 200);
      const verifiedBody = await verifyRes.json();
      assert.strictEqual(verifiedBody.verified, true);
      assert.strictEqual(verifiedBody.draft.status, 'confirmed');
      assert.strictEqual(verifiedBody.draft.pmsReference, pmsReference);

      // Step 6: Laminar profile now shows confirmed with pmsReference
      const profileAfter = await (
        await getLaminarProfileRoute(
          createGetRequest('http://localhost:3000/api/laminar/DEMO-103'),
          { params: { patientRef: 'DEMO-103' } }
        )
      ).json();
      const entryAfter = profileAfter.entries.find((e: any) => e.draftId === draft.id);
      assert.strictEqual(entryAfter.status, 'confirmed');
      assert.strictEqual(entryAfter.pmsReference, pmsReference);

      // Step 7: Staff naive retry / repeated approval -> strictly idempotent, no duplicate
      const retryApproveRes = await approveDraftRoute(
        createJsonRequest(`http://localhost:3000/api/drafts/${draft.id}/approve`, {
          patientRef: 'DEMO-103',
          requestType: 'callback',
          callbackPreference: 'after 2 p.m.',
        }),
        { params: { id: draft.id } }
      );
      assert.strictEqual(retryApproveRes.status, 200);
      const retryBody = await retryApproveRes.json();
      assert.strictEqual(retryBody.draft.status, 'confirmed');
      assert.strictEqual(retryBody.pmsResult.pmsReference, pmsReference);

      // Step 8: Confirm profile still has exactly 1 entry for this draft
      const profileFinal = await (
        await getLaminarProfileRoute(
          createGetRequest('http://localhost:3000/api/laminar/DEMO-103'),
          { params: { patientRef: 'DEMO-103' } }
        )
      ).json();
      const matchingEntries = profileFinal.entries.filter((e: any) => e.draftId === draft.id);
      assert.strictEqual(matchingEntries.length, 1);
    });
  });
});
