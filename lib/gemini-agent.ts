import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedData } from './types';
import { extractFromNote as fallbackMockExtract } from './mock-agent';

export interface AgentExtractionResult extends ExtractedData {
  extractorUsed: 'gemini' | 'mock';
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
    // Prioritize low-latency models (gemini-3.5-flash-lite takes ~1.5s vs 17s+ for standard flash)
    const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];
    
    let responseText: string | null = null;
    let lastError: any = null;

    const prompt = `You are a clinical pharmacy intake extraction agent.
Analyze the following free-text clinical intake note and extract three fields into a JSON object:
1. "patientRef": string or null (e.g. "DEMO-101"). Must be the patient identifier or reference. If no patient reference or identifier is mentioned, return null.
2. "requestType": string or null (e.g. "callback", "refill", "transfer"). If not specified, return null.
3. "callbackPreference": string or null (e.g. "after 3 p.m.", "morning"). If no time or callback preference is specified, return null.

Return ONLY a JSON object with this exact shape:
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
      patientRef: parsed.patientRef ? String(parsed.patientRef).trim().toUpperCase() : null,
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
