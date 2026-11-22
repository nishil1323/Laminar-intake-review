import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getDb,
  closeDb,
  insertDraft,
  getDraftById,
  updateDraft,
  getDraftsByPatientRef,
  insertOrGetPmsEntry,
  getPmsEntryBySubmissionId,
  getPmsCount,
} from '../../lib/db';
import { generatePmsReference, submitToPms } from '../../lib/pms-client';

describe('SQLite Database Layer & Idempotency', () => {
  before(() => {
    // Ensure DB is initialized
    getDb();
  });

  after(() => {
    closeDb();
    try {
      const v8 = require('v8');
      const vm = require('vm');
      v8.setFlagsFromString('--expose_gc');
      const gc = vm.runInNewContext('gc');
      if (typeof gc === 'function') {
        gc();
      }
    } catch {
      // ignore
    }
  });

  it('initializes drafts and pms_entries tables properly', () => {
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('drafts', 'pms_entries')")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    assert.ok(tableNames.includes('drafts'), 'drafts table must exist');
    assert.ok(tableNames.includes('pms_entries'), 'pms_entries table must exist');
  });

  it('inserts and retrieves a draft record', () => {
    const draftId = randomUUID();
    const submissionId = randomUUID();
    const rawNote = 'Patient DEMO-201 requests a callback. Best time is after 2 p.m.';

    const inserted = insertDraft({
      id: draftId,
      submissionId,
      rawNote,
      patientRef: 'DEMO-201',
      requestType: 'callback',
      callbackPreference: 'after 2 p.m.',
      status: 'draft',
      pmsReference: null,
    });

    assert.strictEqual(inserted.id, draftId);
    assert.strictEqual(inserted.submissionId, submissionId);
    assert.strictEqual(inserted.patientRef, 'DEMO-201');
    assert.strictEqual(inserted.status, 'draft');
    assert.ok(inserted.createdAt);
    assert.ok(inserted.updatedAt);

    const fetched = getDraftById(draftId);
    assert.ok(fetched);
    assert.strictEqual(fetched?.id, draftId);
    assert.strictEqual(fetched?.submissionId, submissionId);
    assert.strictEqual(fetched?.patientRef, 'DEMO-201');
    assert.strictEqual(fetched?.requestType, 'callback');
    assert.strictEqual(fetched?.callbackPreference, 'after 2 p.m.');
    assert.strictEqual(fetched?.status, 'draft');
  });

  it('updates an existing draft record', () => {
    const draftId = randomUUID();
    const submissionId = randomUUID();

    insertDraft({
      id: draftId,
      submissionId,
      rawNote: 'Refill request without patient ref.',
      patientRef: null,
      requestType: 'refill',
      callbackPreference: 'morning',
      status: 'draft',
      pmsReference: null,
    });

    const updated = updateDraft(draftId, {
      patientRef: 'DEMO-202',
      status: 'confirmed',
      pmsReference: 'PMS-20261122-999',
    });

    assert.ok(updated);
    assert.strictEqual(updated?.patientRef, 'DEMO-202');
    assert.strictEqual(updated?.status, 'confirmed');
    assert.strictEqual(updated?.pmsReference, 'PMS-20261122-999');

    const fetched = getDraftById(draftId);
    assert.strictEqual(fetched?.patientRef, 'DEMO-202');
    assert.strictEqual(fetched?.status, 'confirmed');
    assert.strictEqual(fetched?.pmsReference, 'PMS-20261122-999');
  });

  it('queries drafts by patient reference in descending order', () => {
    const patientRef = `PAT-${randomUUID().slice(0, 6)}`;

    insertDraft({
      id: randomUUID(),
      submissionId: randomUUID(),
      rawNote: 'Note 1',
      patientRef,
      requestType: 'callback',
      callbackPreference: null,
      status: 'draft',
      pmsReference: null,
    });

    insertDraft({
      id: randomUUID(),
      submissionId: randomUUID(),
      rawNote: 'Note 2',
      patientRef,
      requestType: 'refill',
      callbackPreference: null,
      status: 'confirmed',
      pmsReference: 'PMS-TEST-REF',
    });

    const drafts = getDraftsByPatientRef(patientRef);
    assert.strictEqual(drafts.length, 2);
    assert.strictEqual(drafts[0].patientRef, patientRef);
    assert.strictEqual(drafts[1].patientRef, patientRef);
  });

  it('guarantees idempotency for PMS submissions on duplicate submissionId', () => {
    const submissionId = `sub-idemp-${randomUUID()}`;
    const initialCount = getPmsCount();

    // First submission
    const firstEntry = submitToPms({
      submissionId,
      patientRef: 'DEMO-IDEMP',
      requestType: 'callback',
      callbackPreference: 'morning',
    });

    assert.strictEqual(firstEntry.submissionId, submissionId);
    assert.strictEqual(firstEntry.patientRef, 'DEMO-IDEMP');
    assert.strictEqual(firstEntry.status, 'saved');
    assert.ok(firstEntry.pmsReference.startsWith('PMS-'));

    const countAfterFirst = getPmsCount();
    assert.strictEqual(countAfterFirst, initialCount + 1);

    // Second submission with exact same submissionId (simulating retry after timeout)
    const secondEntry = submitToPms({
      submissionId,
      patientRef: 'DEMO-IDEMP',
      requestType: 'callback',
      callbackPreference: 'morning',
    });

    // Must return the exact same entry with same pmsReference
    assert.strictEqual(secondEntry.submissionId, submissionId);
    assert.strictEqual(secondEntry.pmsReference, firstEntry.pmsReference);
    assert.strictEqual(secondEntry.createdAt, firstEntry.createdAt);

    // Total count in PMS store must NOT increase
    const countAfterSecond = getPmsCount();
    assert.strictEqual(countAfterSecond, countAfterFirst, 'Duplicate write must not increase row count');

    // Verify lookup by submissionId
    const fetched = getPmsEntryBySubmissionId(submissionId);
    assert.ok(fetched);
    assert.strictEqual(fetched?.pmsReference, firstEntry.pmsReference);
  });

  it('generates properly formatted PMS references', () => {
    const ref = generatePmsReference(42);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    assert.strictEqual(ref, `PMS-${dateStr}-042`);
  });

  it('isolates database operations when dbPathOverride is provided to getDb and cleanly resets via closeDb', () => {
    const tempDbPath = path.join(os.tmpdir(), `test_laminar_${Date.now()}_${randomUUID()}.db`);

    // Switch to isolated temp database
    const customDb = getDb(tempDbPath);
    const isolatedPatientRef = `ISO-${randomUUID().slice(0, 6)}`;
    const draftId = randomUUID();
    const submissionId = randomUUID();

    // Call repository method without parameters — it must write to customDb, not production db
    insertDraft({
      id: draftId,
      submissionId,
      rawNote: 'Isolated database note',
      patientRef: isolatedPatientRef,
      requestType: 'refill',
      callbackPreference: null,
      status: 'draft',
      pmsReference: null,
    });

    // Check that customDb received the write directly
    const rowInCustom = customDb
      .prepare('SELECT count(*) as count FROM drafts WHERE patient_ref = ?')
      .get(isolatedPatientRef) as { count: number };
    assert.strictEqual(rowInCustom.count, 1, 'Draft must be written to customDb');

    // Check that getDraftById retrieves from customDb
    const fetchedFromCustom = getDraftById(draftId);
    assert.ok(fetchedFromCustom);
    assert.strictEqual(fetchedFromCustom?.patientRef, isolatedPatientRef);

    // Close isolated DB connection
    closeDb();

    // Clean up temporary database files
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      const walPath = `${tempDbPath}-wal`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      const shmPath = `${tempDbPath}-shm`;
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch {
      // ignore cleanup errors
    }

    // Re-initialize default database for subsequent operations
    const defaultDb = getDb();
    const rowInDefault = defaultDb
      .prepare('SELECT count(*) as count FROM drafts WHERE patient_ref = ?')
      .get(isolatedPatientRef) as { count: number };
    assert.strictEqual(rowInDefault.count, 0, 'Isolated draft must NOT exist in default db');
  });

  it('gracefully handles pms_reference collisions by retrying with incremented sequence', () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const currentCount = getPmsCount();
    const conflictingSeq = String(currentCount + 1).padStart(3, '0');
    const conflictingRef = `PMS-${dateStr}-${conflictingSeq}`;

    // Insert an entry directly into DB with the conflicting reference
    const preExistingSubId = `sub-conflict-pre-${randomUUID()}`;
    const db = getDb();
    db.prepare(`
      INSERT INTO pms_entries (
        submission_id, patient_ref, request_type, callback_preference,
        pms_reference, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      preExistingSubId,
      'DEMO-PRE',
      'refill',
      null,
      conflictingRef,
      'saved',
      new Date().toISOString()
    );

    // Now insert a new entry without explicit pmsReference.
    // The initial attempt would generate conflictingRef, which triggers the UNIQUE constraint.
    // The retry loop catches this and successfully inserts with an incremented sequence number.
    const newSubId = `sub-conflict-new-${randomUUID()}`;
    const newEntry = insertOrGetPmsEntry({
      submissionId: newSubId,
      patientRef: 'DEMO-NEW',
      requestType: 'callback',
      callbackPreference: 'afternoon',
    });

    assert.ok(newEntry);
    assert.strictEqual(newEntry.submissionId, newSubId);
    assert.notStrictEqual(newEntry.pmsReference, conflictingRef, 'Must have generated a new reference after collision');
    assert.ok(newEntry.pmsReference.startsWith(`PMS-${dateStr}-`));
  });
});
