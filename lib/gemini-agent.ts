import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedData } from './types';
import { extractFromNote as fallbackMockExtract } from './mock-agent';
import { getCachedExtraction, setCachedExtraction } from './db';

export interface AgentExtractionResult extends ExtractedData {
  extractorUsed: 'gemini' | 'mock';
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

export async function extractWithAgent(note: string): Promise<AgentExtractionResult> {
  const cacheKey = normalizeCacheKey(note);
  const apiKey = process.env.GEMINI_API_KEY;

  // 1. Check L1 In-Memory Cache (0ms latency, 0 tokens)
  if (cacheKey && memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey)!;
    // If API key is present, only accept cache if it was extracted by Gemini
    if (!apiKey || cached.extractorUsed === 'gemini') {
      console.log(`[ExtractionCache] L1 In-Memory HIT for "${cacheKey.slice(0, 35)}..." (0 tokens used)`);
      return {
        ...cached,
        rawNote: note,
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
        extractorUsed: l2Cached.extractorUsed,
      };
      memoryCache.set(cacheKey, result);
      return result;
    }
  }

  if (!apiKey || apiKey.trim() === '') {
    const mockResult: AgentExtractionResult = {
      ...fallbackMockExtract(note),
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
    // Prioritize low-latency models (gemini-3.5-flash-lite takes ~1s) with automatic fallbacks
    const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.7-flash'];
    
    let responseText: string | null = null;
    let lastError: any = null;

    const prompt = `You are an expert clinical pharmacy intake AI agent acting as a smart human receptionist.
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

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });

        // Timeout per model call at 7500ms to allow sufficient time for model inference
        let timeoutHandle: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(`Timeout exceeding 7500ms for ${modelName}`)), 7500);
        });

        const result: any = await Promise.race([
          model.generateContent(prompt),
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

    const result: AgentExtractionResult = {
      patientRef: normalizePatientRef(parsed.patientRef),
      requestType: parsed.requestType ? String(parsed.requestType).trim().toLowerCase() : null,
      callbackPreference: parsed.callbackPreference ? String(parsed.callbackPreference).trim() : null,
      rawNote: note,
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
      ...fallbackMockExtract(note),
      extractorUsed: 'mock',
    };
  }
}
