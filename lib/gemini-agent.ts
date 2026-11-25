import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedData } from './types';
import { extractFromNote as fallbackMockExtract } from './mock-agent';

export interface AgentExtractionResult extends ExtractedData {
  extractorUsed: 'gemini' | 'mock';
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
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return {
      ...fallbackMockExtract(note),
      extractorUsed: 'mock',
    };
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

        // Hard timeout per model call at 5000ms to guarantee snappy sub-6s UI response
        let timeoutHandle: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(`Timeout exceeding 5000ms for ${modelName}`)), 5000);
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

    return {
      patientRef: normalizePatientRef(parsed.patientRef),
      requestType: parsed.requestType ? String(parsed.requestType).trim().toLowerCase() : null,
      callbackPreference: parsed.callbackPreference ? String(parsed.callbackPreference).trim() : null,
      rawNote: note,
      extractorUsed: 'gemini',
    };
  } catch (err) {
    console.warn('[GeminiAgent] Call failed or timed out, falling back to mock agent:', err);
    return {
      ...fallbackMockExtract(note),
      extractorUsed: 'mock',
    };
  }
}
