import { ExtractedData, Draft, PmsEntry, LaminarProfileResponse } from '../../../lib/types';
import { ApiResponse } from '../types';

export class TestApiClient {
  constructor(private baseUrl: string = 'http://localhost:3000') {}

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<ApiResponse<T>> {
    const url = new URL(path, this.baseUrl).toString();
    const reqHeaders: Record<string, string> = { ...headers };
    let reqBody: string | undefined = undefined;

    if (body !== undefined) {
      if (typeof body === 'string') {
        reqBody = body;
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      } else {
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
        reqBody = JSON.stringify(body);
      }
    }

    const start = performance.now();
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: reqBody,
      signal: AbortSignal.timeout(10000),
    });
    const durationMs = Math.round(performance.now() - start);

    const rawText = await res.text();
    let parsedBody: any = null;
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }

    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      body: parsedBody as T,
      rawText,
      durationMs,
    };
  }

  // F1: Extract endpoint
  async extract(note: string): Promise<ApiResponse<ExtractedData>> {
    return this.request<ExtractedData>('POST', '/api/extract', { note });
  }

  // F2: Draft creation and retrieval
  async createDraft(data: Partial<ExtractedData> | Record<string, any>): Promise<ApiResponse<Draft>> {
    return this.request<Draft>('POST', '/api/drafts', data);
  }

  async getDraft(id: string): Promise<ApiResponse<Draft>> {
    return this.request<Draft>('GET', `/api/drafts/${id}`);
  }

  // F3 & F5: Draft approval (with optional timeout simulation)
  async approveDraft(
    id: string,
    data: {
      patientRef?: string | null;
      requestType?: string | null;
      callbackPreference?: string | null;
    } | Record<string, any>,
    options: {
      simulateTimeout?: boolean;
      extraHeaders?: Record<string, string>;
    } = {}
  ): Promise<ApiResponse<{ draft: Draft; pmsResult?: PmsEntry; message?: string; errors?: string[] }>> {
    const headers: Record<string, string> = { ...options.extraHeaders };
    if (options.simulateTimeout) {
      headers['X-Simulate-Timeout'] = 'true';
    }
    return this.request<{ draft: Draft; pmsResult?: PmsEntry; message?: string; errors?: string[] }>(
      'POST',
      `/api/drafts/${id}/approve`,
      data,
      headers
    );
  }

  // F5: Verify endpoint
  async verifyDraft(
    id: string
  ): Promise<ApiResponse<{ draft: Draft; pmsEntry?: PmsEntry; verified: boolean; message?: string }>> {
    return this.request<{ draft: Draft; pmsEntry?: PmsEntry; verified: boolean; message?: string }>(
      'POST',
      `/api/drafts/${id}/verify`
    );
  }

  // F4: PMS submission and lookup
  async submitPms(
    data: {
      submissionId: string;
      patientRef: string;
      requestType: string;
      callbackPreference?: string | null;
    } | Record<string, any>
  ): Promise<ApiResponse<PmsEntry>> {
    return this.request<PmsEntry>('POST', '/api/pms/submit', data);
  }

  async getPmsStatus(
    submissionId: string
  ): Promise<ApiResponse<{ found: boolean; entry?: PmsEntry }>> {
    return this.request<{ found: boolean; entry?: PmsEntry }>('GET', `/api/pms/status/${submissionId}`);
  }

  // F6: Laminar Profile
  async getLaminarProfile(patientRef: string): Promise<ApiResponse<LaminarProfileResponse>> {
    return this.request<LaminarProfileResponse>('GET', `/api/laminar/${encodeURIComponent(patientRef)}`);
  }

  // Generic raw request for negative/adversarial boundary testing
  async raw(
    method: string,
    path: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<any>> {
    return this.request(method, path, body, headers);
  }
}
