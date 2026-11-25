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

  // 1. Check informal times with morning/mornig/moring/mrng:
  // e.g. "at 3 mornig", "3 morning", "after 3 morning", "before 3 morning", "3 in the morning" -> "3 AM", "after 3 AM", "before 3 AM"
  const morningWithTime = note.match(
    /\b(?:(after|before|at)\s+)?(\d{1,2}(?::\d{2})?)\s*(?:in\s+(?:the\s+)?)?(?:morn(?:ing|ig)?|mrng|moring)\b/i
  );
  if (morningWithTime) {
    const prefix = morningWithTime[1] ? morningWithTime[1].toLowerCase() : '';
    const time = morningWithTime[2];
    if (prefix === 'after') return `after ${time} AM`;
    if (prefix === 'before') return `before ${time} AM`;
    return `${time} AM`;
  }

  // Also check reverse order: "morning at 3"
  const morningReverse = note.match(
    /\b(?:in\s+(?:the\s+)?)?(?:morn(?:ing|ig)?|mrng|moring)\s+(?:at\s+|after\s+|before\s+)?(\d{1,2}(?::\d{2})?)\b/i
  );
  if (morningReverse) {
    return `${morningReverse[1]} AM`;
  }

  // 2. Check informal times with evening/night/afternoon:
  // e.g. "at 3 evening", "3 night", "after 4 evening", "3 in the evening" -> "3 PM", "after 4 PM"
  const eveningWithTime = note.match(
    /\b(?:(after|before|at)\s+)?(\d{1,2}(?::\d{2})?)\s*(?:in\s+(?:the\s+)?)?(?:evening|eve|night|nite|afternoon|noon)\b/i
  );
  if (eveningWithTime) {
    const prefix = eveningWithTime[1] ? eveningWithTime[1].toLowerCase() : '';
    const time = eveningWithTime[2];
    if (prefix === 'after') return `after ${time} PM`;
    if (prefix === 'before') return `before ${time} PM`;
    return `${time} PM`;
  }

  // Also check reverse order: "evening at 3", "night at 10"
  const eveningReverse = note.match(
    /\b(?:in\s+(?:the\s+)?)?(?:evening|eve|night|nite|afternoon|noon)\s+(?:at\s+|after\s+|before\s+)?(\d{1,2}(?::\d{2})?)\b/i
  );
  if (eveningReverse) {
    return `${eveningReverse[1]} PM`;
  }

  // 3. Match phrases like "Best time is after 3 p.m.", "Prefers morning callback", "Preferred time: morning"
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

  // 4. Check standalone time like "4 pm", "4:30 pm", "4pm", "4 a.m."
  const standaloneTime = note.match(/\b(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?|pm|am))\b/i);
  if (standaloneTime) {
    return standaloneTime[1].trim();
  }

  // 5. Check standalone "at 3"
  const atMatch = note.match(/\bat\s+(\d+(?::\d+)?)\b/i);
  if (atMatch) {
    return atMatch[1];
  }

  return null;
}

export function extractFromNote(note: string, hasImage: boolean = false): ExtractedData {
  const patientRef = extractPatientRef(note);
  const requestType = extractRequestType(note);
  const callbackPreference = extractCallbackPref(note);
  let rawNote = note || '';
  if (hasImage && !rawNote) {
    rawNote = patientRef || requestType
      ? '[Uploaded Photo]'
      : '[Uploaded Photo: No clinical or prescription text detected]';
  } else if (hasImage) {
    rawNote = `${rawNote}\n\n[Uploaded Photo]`;
  }

  return {
    patientRef,
    requestType,
    callbackPreference,
    rawNote,
  };
}
