import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedData } from './types';
import { extractFromNote as fallbackMockExtract } from './mock-agent';
import { getCachedExtraction, setCachedExtraction } from './db';

export interface AgentExtractionResult extends ExtractedData {
  extractorUsed: 'gemini' | 'mock';
  imageUrl?: string | null;
}

// L1 In-Memory Cache (sub-millisecond lookups, 0 tokens)
const memoryCache = new Map<string, AgentExtractionResult>();

function normalizeCacheKey(note: string): string {
  if (!note || typeof note !== 'string') return '';
  return note.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePatientRef(raw: any): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (
    !trimmed ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'i' ||
    lower === 'me' ||
    lower === 'my' ||
    lower === 'myself' ||
    lower === 'caller' ||
    lower === 'anonymous' ||
    lower === 'someone' ||
    lower === 'unknown' ||
    lower === 'none'
  ) {
    return null;
  }
  // Standardize patient IDs with hyphens (e.g. DEMO-101) to uppercase
  if (/^[A-Za-z]+-\d+$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

function normalizeRequestType(raw: any): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (
    !trimmed ||
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed === 'none' ||
    trimmed === 'unknown' ||
    trimmed === 'n/a' ||
    trimmed === 'not applicable'
  ) {
    return null;
  }
  if (/refill/i.test(trimmed)) return 'refill';
  if (/callback/i.test(trimmed)) return 'callback';
  if (/transfer/i.test(trimmed)) return 'transfer';
  if (/consult/i.test(trimmed)) return 'consultation';
  return trimmed;
}

export async function extractWithAgent(
  note: string,
  image?: { data: string; mimeType: string }
): Promise<AgentExtractionResult> {
  const cleanImageData = image?.data
    ? image.data.includes('base64,')
      ? image.data.split('base64,')[1]
      : image.data
    : null;
  const imageMimeType = image?.mimeType || 'image/jpeg';

  const cacheKey = cleanImageData
    ? 'img_' +
      crypto
        .createHash('sha256')
        .update(cleanImageData.slice(0, 1000) + cleanImageData.length + (note || ''))
        .digest('hex')
    : normalizeCacheKey(note);

  const apiKey = process.env.GEMINI_API_KEY;

  // 1. Check L1 In-Memory Cache (0ms latency, 0 tokens)
  if (cacheKey && memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey)!;
    // If API key is present, only accept cache if it was extracted by Gemini
    if (!apiKey || cached.extractorUsed === 'gemini') {
      console.log(`[ExtractionCache] L1 In-Memory HIT for "${cacheKey.slice(0, 35)}..." (0 tokens used)`);
      return {
        ...cached,
        rawNote: cached.rawNote || note,
        imageUrl: cleanImageData ? `data:${imageMimeType};base64,${cleanImageData}` : cached.imageUrl,
      };
    }
  }

  // 2. Check L2 SQLite Persistent Cache (survives dev server restarts, 0 tokens)
  if (cacheKey) {
    const l2Cached = getCachedExtraction(cacheKey);
    if (l2Cached && (!apiKey || l2Cached.extractorUsed === 'gemini')) {
      console.log(`[ExtractionCache] L2 SQLite HIT for "${cacheKey.slice(0, 35)}..." (0 tokens used)`);
      const result: AgentExtractionResult = {
        patientRef: l2Cached.patientRef,
        requestType: l2Cached.requestType,
        callbackPreference: l2Cached.callbackPreference,
        rawNote: note,
        imageUrl: cleanImageData ? `data:${imageMimeType};base64,${cleanImageData}` : null,
        extractorUsed: l2Cached.extractorUsed,
      };
      memoryCache.set(cacheKey, result);
      return result;
    }
  }

  if (!apiKey || apiKey.trim() === '') {
    const mockResult: AgentExtractionResult = {
      ...fallbackMockExtract(note, !!cleanImageData),
      imageUrl: cleanImageData ? `data:${imageMimeType};base64,${cleanImageData}` : null,
      extractorUsed: 'mock',
    };
    if (cacheKey) {
      memoryCache.set(cacheKey, mockResult);
      setCachedExtraction(cacheKey, mockResult);
    }
    return mockResult;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    // Candidate models with fast fallbacks for high demand resilience
    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
    ];
    
    let responseText: string | null = null;
    let lastError: any = null;

    const textPrompt = `You are an expert clinical pharmacy intake AI agent acting as a smart human receptionist.
Analyze the following free-text, shorthand, conversational, or voice-transcribed clinical intake note. Notes may contain misspellings (e.g. 'Patnt'), informal times, or casual speech.

Extract 3 structured fields:

1. "patientRef": (string or null)
   - The patient identifier (e.g. "DEMO-101") or the patient's actual name (e.g. "bittu", "Nishil").
   - Understand typos like 'Patnt', 'pt', 'patient', 'mr.', 'mrs.'.
   - CRITICAL RULE: If the note uses first-person pronouns like "I", "me", "my" without specifying a name (e.g. "I needs callback at 3"), or refers to an anonymous/generic caller (e.g. "Caller asks for..."), return null. "I", "Caller", "Someone" are NOT patient names.
   - If an alphanumeric code with hyphen (like "DEMO-101") is provided, format in uppercase. If a person's name (like "bittu" or "Nishil") is provided, preserve the name.

2. "requestType": (string or null)
   - Category in lowercase: "callback", "refill", "transfer", "consultation", etc.
   - Understand natural language: "wants callback", "needs callback", "call back" -> "callback". "prescription refill for lisinopril", "refil" -> "refill". "transfer rx" -> "transfer".

3. "callbackPreference": (string or null)
   - The preferred callback time or time window.
   - Smartly interpret informal time descriptions:
     * "3 evening" or "3 in the evening" -> "3 PM"
     * "at 3" (without am/pm) -> "3"
     * "after 3 p.m." -> "after 3 p.m."
     * "morning" or "prefers morning callback" -> "morning"
     * "afternoon" -> "afternoon"
     * "evening" -> "evening"
   - If no time preference is stated, return null.

Return ONLY a JSON object:
{
  "patientRef": string | null,
  "requestType": string | null,
  "callbackPreference": string | null
}

Intake note:
"""
${note}
"""`;

    const imagePrompt = `You are an expert clinical pharmacy intake AI agent acting as a smart human receptionist and medical handwriting OCR specialist.
Carefully inspect the attached photo. It may be a handwritten doctor's prescription, printed Rx slip, medication label, clinic order, or an unrelated non-medical photo.

CRITICAL INSTRUCTIONS:
1. Handwriting & Messy Doctor Notes:
   - Carefully decipher cursive, shorthand, or messy physician handwriting.
   - Use pharmacological and medical context to identify medication names (e.g. Paracetamol, Amoxicillin, Metformin, Lisinopril, Atorvastatin, etc.), dosages (e.g. 500mg, 10mg), frequencies (e.g. daily, twice daily, PRN), and patient names.
   - If handwriting is difficult to read, do your best to decipher the letters using clinical context.

2. Non-Medical, Blank, or Irrelevant Images:
   - If the image does NOT contain any prescription, medical document, clinical note, medication order, or patient information (e.g. a photo of a room, ceiling, face, blank surface, random object, or unreadable blur):
     * "patientRef" MUST be null.
     * "requestType" MUST be null.
     * "callbackPreference" MUST be null.
     * "transcribedText" should state: "No medical prescription or clinical text detected in this image."
     * DO NOT invent, guess, or default any fields if there is no medical document in the image.

3. Field Extraction Rules:
   - "patientRef": (string or null)
     The patient's full name or patient ID if clearly stated on the prescription. If not present or not a medical document, return null. Do NOT use the doctor's name, clinic name, or pharmacy name as patientRef.
   - "requestType": (string or null)
     The category in lowercase if a medical order/request is present: "refill" (for prescriptions/medications), "callback", "transfer", or "consultation". If NO medical document or request is present in the image, return null.
   - "callbackPreference": (string or null)
     Any specific callback time or dosage timing mentioned on the prescription (e.g. "morning", "after 3 p.m.", "3 PM"). If none, return null.
   - "transcribedText": (string or null)
     A faithful transcription of all legible handwritten or printed clinical text on the document. If no medical text is detected, return null or a message indicating no medical text found.

Return ONLY a JSON object:
{
  "patientRef": string | null,
  "requestType": string | null,
  "callbackPreference": string | null,
  "transcribedText": string | null
}`;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });

        // Timeout per model call at 7500ms
        let timeoutHandle: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(`Timeout exceeding 7500ms for ${modelName}`)), 7500);
        });

        const contents: any = cleanImageData
          ? [
              imagePrompt,
              {
                inlineData: {
                  data: cleanImageData,
                  mimeType: imageMimeType,
                },
              },
            ]
          : textPrompt;

        const result: any = await Promise.race([
          model.generateContent(contents),
          timeoutPromise,
        ]).finally(() => clearTimeout(timeoutHandle));

        responseText = result.response.text();
        if (responseText) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[GeminiAgent] ${modelName} failed or timed out:`, err?.message?.slice(0, 100));
      }
    }

    if (!responseText) {
      throw lastError || new Error('No candidate Gemini model responded');
    }

    const parsed = JSON.parse(responseText);

    let rawNote = (note || '').trim();
    if (cleanImageData) {
      const transcribed = parsed.transcribedText ? String(parsed.transcribedText).trim() : '';
      rawNote = transcribed || '[Uploaded Photo - No medical text detected]';
    }

    const result: AgentExtractionResult = {
      patientRef: normalizePatientRef(parsed.patientRef),
      requestType: normalizeRequestType(parsed.requestType),
      callbackPreference: parsed.callbackPreference ? String(parsed.callbackPreference).trim() : null,
      rawNote,
      imageUrl: cleanImageData ? `data:${imageMimeType};base64,${cleanImageData}` : null,
      extractorUsed: 'gemini',
    };

    if (cacheKey) {
      memoryCache.set(cacheKey, result);
      setCachedExtraction(cacheKey, result);
    }

    return result;
  } catch (err) {
    console.warn('[GeminiAgent] Call failed or timed out, falling back to mock agent:', err);
    // Return mock fallback for this request, but DO NOT poison the cache with failure fallbacks
    return {
      ...fallbackMockExtract(note, !!cleanImageData),
      imageUrl: cleanImageData ? `data:${imageMimeType};base64,${cleanImageData}` : null,
      extractorUsed: 'mock',
    };
  }
}
