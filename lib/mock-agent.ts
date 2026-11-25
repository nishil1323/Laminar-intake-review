import { ExtractedData } from './types';

export function extractPatientRef(note: string): string | null {
  if (!note || typeof note !== 'string') return null;

  // Check code format: e.g. "Patient DEMO-101" or "patnt DEMO-101"
  const idMatch = note.match(/(?:Patient|Patnt|pt)\s+([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)/i);
  if (idMatch) return idMatch[1].toUpperCase();

  // Check first person pronouns: "I needs...", "I want..." -> null (no patient name)
  if (/^I\s+(?:needs|wants|requests|asks|prefer)/i.test(note.trim())) {
    return null;
  }

  // Check generic caller: "Caller asks..." -> null
  if (/^Caller\s+/i.test(note.trim())) {
    return null;
  }

  // Check typo prefix: e.g. "Patnt bittu" or "Patient John"
  const typoMatch = note.match(/(?:Patient|Patnt|pt)\s+([A-Za-z0-9]+)/i);
  if (typoMatch) {
    const name = typoMatch[1].trim();
    if (!/^(null|undefined|caller|unknown|none|request|requests|wants|needs)$/i.test(name)) {
      return name;
    }
  }

  // Check name at start: e.g. "Nishil needs callback at 3" or shorthand "Aniha 4 pm callback"
  const nameMatch = note.trim().match(/^([A-Za-z][A-Za-z0-9_-]*)\b/);
  if (nameMatch) {
    const candidate = nameMatch[1].trim();
    if (!/^(I|Caller|Patient|Patnt|Pt|Someone|Prescription|Refill|Transfer|Callback|Best|Preferred|Please|Yesterday|Today|Tomorrow)$/i.test(candidate)) {
      if (/\b(?:needs|wants|requests|asks|\d+\s*(?:am|pm|[ap]\.m\.)|callback|refill|transfer)\b/i.test(note)) {
        return candidate;
      }
    }
  }

  return null;
}

export function extractRequestType(note: string): string | null {
  if (!note || typeof note !== 'string') return null;
  // Check refill and transfer before callback fallback
  if (/refill/i.test(note)) return 'refill';
  if (/transfer/i.test(note)) return 'transfer';
  if (/call\s*back|callback/i.test(note)) return 'callback';
  return null;
}

export function extractCallbackPref(note: string): string | null {
  if (!note || typeof note !== 'string') return null;

  // Check informal times like "at 3 evening" -> "3 PM"
  const eveningMatch = note.match(/(?:at|after|before)\s+(\d+)\s+evening/i);
  if (eveningMatch) {
    return `${eveningMatch[1]} PM`;
  }

  // Check informal times like "at 3 morning" -> "3 AM"
  const morningMatch = note.match(/(?:at|after|before)\s+(\d+)\s+morning/i);
  if (morningMatch) {
    return `${morningMatch[1]} AM`;
  }

  // Match phrases like "Best time is after 3 p.m.", "Prefers morning callback", "Preferred time: morning"
  const prefMatch = note.match(
    /(?:best time|preferred\s+time|preferred?|prefers?|after|before)[:\s]+(?:is\s+)?(.+?)(?:\.(?:\s|$)|$)/i
  );
  if (prefMatch) {
    let val = prefMatch[1].trim();
    val = val.replace(/\s+callback$/i, '').trim();
    if (/[ap]\.m$/i.test(val)) {
      val = val + '.';
    }
    if (val.length > 0) return val;
  }

  // Check standalone time like "4 pm", "4:30 pm", "4pm", "4 a.m."
  const standaloneTime = note.match(/\b(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?|pm|am))\b/i);
  if (standaloneTime) {
    return standaloneTime[1].trim();
  }

  // Check standalone "at 3"
  const atMatch = note.match(/\bat\s+(\d+(?::\d+)?)\b/i);
  if (atMatch) {
    return atMatch[1];
  }

  return null;
}

export function extractFromNote(note: string): ExtractedData {
  return {
    patientRef: extractPatientRef(note),
    requestType: extractRequestType(note),
    callbackPreference: extractCallbackPref(note),
    rawNote: note || '',
  };
}
