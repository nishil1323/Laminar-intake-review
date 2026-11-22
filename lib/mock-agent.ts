import { ExtractedData } from './types';

export function extractPatientRef(note: string): string | null {
  if (!note || typeof note !== 'string') return null;
  const match = note.match(/Patient\s+([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)/i);
  return match ? match[1].toUpperCase() : null;
}

export function extractRequestType(note: string): string | null {
  if (!note || typeof note !== 'string') return null;
  // Check refill and transfer before callback fallback
  if (/refill/i.test(note)) return 'refill';
  if (/transfer/i.test(note)) return 'transfer';
  if (/callback/i.test(note)) return 'callback';
  return null;
}

export function extractCallbackPref(note: string): string | null {
  if (!note || typeof note !== 'string') return null;

  // Match phrases like "Best time is after 3 p.m.", "Prefers morning callback", "Preferred time: morning"
  const prefMatch = note.match(
    /(?:best time|preferred\s+time|preferred?|prefers?|after|before)[:\s]+(?:is\s+)?(.+?)(?:\.(?:\s|$)|$)/i
  );
  if (!prefMatch) return null;

  let val = prefMatch[1].trim();

  // Strip trailing "callback" word if present (e.g. "morning callback" -> "morning")
  val = val.replace(/\s+callback$/i, '').trim();

  // If the value ended before the trailing period in "p.m." or "a.m.", restore it cleanly
  if (/[ap]\.m$/i.test(val)) {
    val = val + '.';
  }

  return val.length > 0 ? val : null;
}

export function extractFromNote(note: string): ExtractedData {
  return {
    patientRef: extractPatientRef(note),
    requestType: extractRequestType(note),
    callbackPreference: extractCallbackPref(note),
    rawNote: note || '',
  };
}
