import { Draft, ExtractedData, PmsEntry, LaminarProfileResponse, DraftStatus } from '../../lib/types';
import type { TestApiClient } from './helpers/api-client';
import type { TestDbClient } from './helpers/db-client';

export interface ApiResponse<T = any> {
  status: number;
  ok: boolean;
  headers: Headers;
  body: T;
  rawText: string;
  durationMs: number;
}

export interface DraftRow {
  id: string;
  submission_id: string;
  raw_note: string;
  patient_ref: string | null;
  request_type: string | null;
  callback_preference: string | null;
  status: DraftStatus;
  pms_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmsEntryRow {
  submission_id: string;
  patient_ref: string;
  request_type: string;
  callback_preference: string | null;
  pms_reference: string;
  status: 'saved';
  created_at: string;
}

export interface TestContext {
  api: TestApiClient;
  db: TestDbClient;
  baseUrl: string;
  generatePatientRef: (prefix?: string) => string;
}

export interface TestCase {
  id: string;              // e.g. "T1.F1.01"
  name: string;            // Human-readable title
  tier: 1 | 2 | 3 | 4;
  category: string;        // e.g. "F1: Capture & Extraction"
  fn: (ctx: TestContext) => Promise<void>;
}

export interface TestResult {
  id: string;
  name: string;
  tier: number;
  category: string;
  passed: boolean;
  durationMs: number;
  error?: Error;
  failureDetails?: string;
}

export interface TierReport {
  tier: number;
  title: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestResult[];
}

export interface SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  tierReports: TierReport[];
}

export interface RunnerOptions {
  baseUrl?: string;
  tierFilter?: number;
  testFilter?: string;
  bail?: boolean;
  dryRun?: boolean;
  checkSyntax?: boolean;
}
