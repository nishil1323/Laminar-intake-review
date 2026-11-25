import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Draft, DraftStatus, PmsEntry } from './types';

const globalForDb = globalThis as unknown as { db: Database.Database | undefined };

interface DraftRow {
  id: string;
  submission_id: string;
  raw_note: string;
  patient_ref: string | null;
  request_type: string | null;
  callback_preference: string | null;
  status: string;
  pms_reference: string | null;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
}

interface PmsRow {
  submission_id: string;
  patient_ref: string;
  request_type: string;
  callback_preference: string | null;
  pms_reference: string;
  status: string;
  created_at: string;
}

function rowToDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    submissionId: row.submission_id,
    rawNote: row.raw_note,
    patientRef: row.patient_ref,
    requestType: row.request_type,
    callbackPreference: row.callback_preference,
    status: row.status as DraftStatus,
    pmsReference: row.pms_reference,
    imageUrl: row.image_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPmsEntry(row: PmsRow): PmsEntry {
  return {
    submissionId: row.submission_id,
    patientRef: row.patient_ref,
    requestType: row.request_type,
    callbackPreference: row.callback_preference,
    pmsReference: row.pms_reference,
    status: row.status as 'saved',
    createdAt: row.created_at,
  };
}

export function getDb(dbPathOverride?: string): Database.Database {
  if (globalForDb.db && !dbPathOverride) {
    return globalForDb.db;
  }

  if (globalForDb.db && dbPathOverride) {
    try {
      globalForDb.db.close();
    } catch {
      // ignore if already closed
    }
    globalForDb.db = undefined;
  }

  let dbPath: string;
  if (dbPathOverride) {
    dbPath = dbPathOverride;
  } else if (process.env.VERCEL) {
    dbPath = path.join('/tmp', 'laminar.db');
  } else {
    const dbDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    dbPath = path.join(dbDir, 'laminar.db');
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      submission_id TEXT UNIQUE NOT NULL,
      raw_note TEXT NOT NULL,
      patient_ref TEXT,
      request_type TEXT,
      callback_preference TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      pms_reference TEXT,
      image_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pms_entries (
      submission_id TEXT PRIMARY KEY,
      patient_ref TEXT NOT NULL,
      request_type TEXT NOT NULL,
      callback_preference TEXT,
      pms_reference TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'saved',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extraction_cache (
      cache_key TEXT PRIMARY KEY,
      patient_ref TEXT,
      request_type TEXT,
      callback_preference TEXT,
      extractor_used TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_drafts_patient_ref ON drafts(patient_ref);
    CREATE INDEX IF NOT EXISTS idx_drafts_submission_id ON drafts(submission_id);
  `);

  try {
    db.exec(`ALTER TABLE drafts ADD COLUMN image_url TEXT;`);
  } catch {
    // Column already exists
  }

  globalForDb.db = db;

  return db;
}

export function closeDb(): void {
  if (globalForDb.db) {
    try {
      globalForDb.db.close();
    } catch {
      // ignore if already closed
    }
    globalForDb.db = undefined;
  }
}

export function insertDraft(draft: Omit<Draft, 'createdAt' | 'updatedAt'>): Draft {
  const db = getDb();
  const now = new Date().toISOString();
  const status = draft.status || 'draft';
  const pmsReference = draft.pmsReference || null;
  const imageUrl = draft.imageUrl || null;

  const stmt = db.prepare(`
    INSERT INTO drafts (
      id, submission_id, raw_note, patient_ref, request_type,
      callback_preference, status, pms_reference, image_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    draft.id,
    draft.submissionId,
    draft.rawNote,
    draft.patientRef ?? null,
    draft.requestType ?? null,
    draft.callbackPreference ?? null,
    status,
    pmsReference,
    imageUrl,
    now,
    now
  );

  return {
    ...draft,
    status,
    pmsReference,
    imageUrl,
    createdAt: now,
    updatedAt: now,
  };
}

export function getDraftById(id: string): Draft | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM drafts WHERE id = ? OR submission_id = ?');
  const row = stmt.get(id, id) as DraftRow | undefined;
  return row ? rowToDraft(row) : null;
}

export function updateDraft(id: string, updates: Partial<Draft>): Draft | null {
  const db = getDb();
  const existing = getDraftById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Draft = {
    ...existing,
    ...updates,
    updatedAt: now,
  };

  const stmt = db.prepare(`
    UPDATE drafts SET
      raw_note = ?,
      patient_ref = ?,
      request_type = ?,
      callback_preference = ?,
      status = ?,
      pms_reference = ?,
      updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updated.rawNote,
    updated.patientRef ?? null,
    updated.requestType ?? null,
    updated.callbackPreference ?? null,
    updated.status,
    updated.pmsReference ?? null,
    now,
    id
  );

  return updated;
}

export function getDraftsByPatientRef(patientRef: string): Draft[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM drafts WHERE patient_ref = ? ORDER BY created_at DESC');
  const rows = stmt.all(patientRef) as DraftRow[];
  return rows.map(rowToDraft);
}

export function getPmsCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM pms_entries').get() as { count: number };
  return row ? row.count : 0;
}

export function getPmsEntryBySubmissionId(submissionId: string): PmsEntry | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM pms_entries WHERE submission_id = ?');
  const row = stmt.get(submissionId) as PmsRow | undefined;
  return row ? rowToPmsEntry(row) : null;
}

export function insertOrGetPmsEntry(
  entry: Omit<PmsEntry, 'pmsReference' | 'status' | 'createdAt'> & { pmsReference?: string }
): PmsEntry {
  const db = getDb();

  // 1. Idempotency check: if entry with submissionId exists, return it immediately
  const existing = getPmsEntryBySubmissionId(entry.submissionId);
  if (existing) {
    return existing;
  }

  // 2. Generate reference and insert with collision retry
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const now = new Date().toISOString();
  const status = 'saved';

  const stmt = db.prepare(`
    INSERT INTO pms_entries (
      submission_id, patient_ref, request_type, callback_preference,
      pms_reference, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(submission_id) DO NOTHING
  `);

  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    const count = getPmsCount();
    const seq = String(count + attempts).padStart(3, '0');
    const pmsReference = entry.pmsReference || `PMS-${dateStr}-${seq}`;

    try {
      stmt.run(
        entry.submissionId,
        entry.patientRef,
        entry.requestType,
        entry.callbackPreference ?? null,
        pmsReference,
        status,
        now
      );
      break;
    } catch (err: any) {
      if (entry.pmsReference) {
        // If caller provided an explicit pmsReference that collided, cannot auto-generate alternative
        throw err;
      }
      if (err.message && err.message.includes('UNIQUE constraint failed: pms_entries.pms_reference')) {
        continue;
      }
      throw err;
    }
  }

  // Return the inserted (or existing if conflict handled) entry
  const result = getPmsEntryBySubmissionId(entry.submissionId);
  if (!result) {
    throw new Error(`Failed to insert or retrieve PMS entry for submissionId: ${entry.submissionId}`);
  }
  return result;
}

export function getCachedExtraction(cacheKey: string): {
  patientRef: string | null;
  requestType: string | null;
  callbackPreference: string | null;
  extractorUsed: 'gemini' | 'mock';
} | null {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT patient_ref, request_type, callback_preference, extractor_used FROM extraction_cache WHERE cache_key = ?')
      .get(cacheKey) as any;
    if (!row) return null;
    return {
      patientRef: row.patient_ref ?? null,
      requestType: row.request_type ?? null,
      callbackPreference: row.callback_preference ?? null,
      extractorUsed: row.extractor_used as 'gemini' | 'mock',
    };
  } catch {
    return null;
  }
}

export function setCachedExtraction(
  cacheKey: string,
  data: {
    patientRef: string | null;
    requestType: string | null;
    callbackPreference: string | null;
    extractorUsed: 'gemini' | 'mock';
  }
): void {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO extraction_cache (cache_key, patient_ref, request_type, callback_preference, extractor_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        patient_ref = excluded.patient_ref,
        request_type = excluded.request_type,
        callback_preference = excluded.callback_preference,
        extractor_used = excluded.extractor_used,
        created_at = excluded.created_at
    `);
    stmt.run(
      cacheKey,
      data.patientRef ?? null,
      data.requestType ?? null,
      data.callbackPreference ?? null,
      data.extractorUsed,
      new Date().toISOString()
    );
  } catch {
    // Non-critical, ignore write errors
  }
}

