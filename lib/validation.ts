import { ValidationResult } from './types';

export function validateDraftApproval(data?: {
  patientRef?: string | null;
  requestType?: string | null;
} | null): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: ['Patient reference is required', 'Request type is required'],
    };
  }

  if (typeof data.patientRef !== 'string' || data.patientRef.trim() === '') {
    errors.push('Patient reference is required');
  }

  if (typeof data.requestType !== 'string' || data.requestType.trim() === '') {
    errors.push('Request type is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
