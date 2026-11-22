import { PmsEntry } from './types';
import { insertOrGetPmsEntry, getPmsCount } from './db';

export function generatePmsReference(counter?: number): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(counter !== undefined ? counter : getPmsCount() + 1).padStart(3, '0');
  return `PMS-${dateStr}-${seq}`;
}

export function submitToPms(entry: {
  submissionId: string;
  patientRef: string;
  requestType: string;
  callbackPreference: string | null;
}): PmsEntry {
  return insertOrGetPmsEntry(entry);
}
