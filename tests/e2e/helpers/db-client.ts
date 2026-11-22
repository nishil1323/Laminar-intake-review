import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DraftRow, PmsEntryRow } from '../types';

export class TestDbClient {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.resolve(process.cwd(), 'data/laminar.db');
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolvedPath, { timeout: 5000 });
    this.db.pragma('journal_mode = WAL');
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        submission_id TEXT UNIQUE NOT NULL,
        raw_note TEXT NOT NULL,
        patient_ref TEXT,
        request_type TEXT,
        callback_preference TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        pms_reference TEXT,
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
    `);
  }

  getDraftById(id: string): DraftRow | null {
    const stmt = this.db.prepare('SELECT * FROM drafts WHERE id = ?');
    return (stmt.get(id) as DraftRow) || null;
  }

  getDraftBySubmissionId(submissionId: string): DraftRow | null {
    const stmt = this.db.prepare('SELECT * FROM drafts WHERE submission_id = ?');
    return (stmt.get(submissionId) as DraftRow) || null;
  }

  getDraftsByPatientRef(patientRef: string): DraftRow[] {
    const stmt = this.db.prepare(
      'SELECT * FROM drafts WHERE patient_ref = ? ORDER BY datetime(created_at) DESC'
    );
    return (stmt.all(patientRef) as DraftRow[]) || [];
  }

  countDrafts(whereClause?: string, ...params: any[]): number {
    const sql = whereClause
      ? `SELECT COUNT(*) as count FROM drafts WHERE ${whereClause}`
      : 'SELECT COUNT(*) as count FROM drafts';
    const row = this.db.prepare(sql).get(...params) as { count: number };
    return row.count;
  }

  getPmsEntry(submissionId: string): PmsEntryRow | null {
    const stmt = this.db.prepare('SELECT * FROM pms_entries WHERE submission_id = ?');
    return (stmt.get(submissionId) as PmsEntryRow) || null;
  }

  getPmsEntryByReference(pmsReference: string): PmsEntryRow | null {
    const stmt = this.db.prepare('SELECT * FROM pms_entries WHERE pms_reference = ?');
    return (stmt.get(pmsReference) as PmsEntryRow) || null;
  }

  countPmsEntries(submissionId?: string): number {
    if (submissionId) {
      const row = this.db
        .prepare('SELECT COUNT(*) as count FROM pms_entries WHERE submission_id = ?')
        .get(submissionId) as { count: number };
      return row.count;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM pms_entries').get() as { count: number };
    return row.count;
  }

  query<T = any>(sql: string, ...params: any[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  queryOne<T = any>(sql: string, ...params: any[]): T | null {
    return (this.db.prepare(sql).get(...params) as T) || null;
  }

  execute(sql: string, ...params: any[]): Database.RunResult {
    return this.db.prepare(sql).run(...params);
  }

  tableExists(tableName: string): boolean {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(tableName);
    return !!row;
  }

  close(): void {
    try {
      this.db.close();
    } catch {}
  }
}
