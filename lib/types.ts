export type DraftStatus = 'draft' | 'awaiting_confirmation' | 'confirmed';

export interface ExtractedData {
  patientRef: string | null;
  requestType: string | null;
  callbackPreference: string | null;
  rawNote: string;
}

export interface Draft {
  id: string;
  submissionId: string;
  rawNote: string;
  patientRef: string | null;
  requestType: string | null;
  callbackPreference: string | null;
  status: DraftStatus;
  pmsReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PmsEntry {
  submissionId: string;
  patientRef: string;
  requestType: string;
  callbackPreference: string | null;
  pmsReference: string;
  status: 'saved';
  createdAt: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LaminarProfileEntry {
  draftId: string;
  submissionId: string;
  requestType: string;
  callbackPreference: string | null;
  status: DraftStatus;
  pmsReference: string | null;
  updatedAt: string;
}

export interface LaminarProfileResponse {
  patientRef: string;
  entries: LaminarProfileEntry[];
}
