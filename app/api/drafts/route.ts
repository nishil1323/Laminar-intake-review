import { NextResponse } from 'next/server';
import { insertDraft } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    let body: any;
    try {
      const text = await request.text();
      if (!text || text.trim() === '') {
        return NextResponse.json(
          { error: 'Request body cannot be empty' },
          { status: 400 }
        );
      }
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Request body must be a valid JSON object' },
        { status: 400 }
      );
    }

    if (typeof body.rawNote !== 'string') {
      return NextResponse.json(
        { error: 'rawNote is required' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const submissionId = crypto.randomUUID();

    const rawNote = body.rawNote;
    const patientRef =
      typeof body.patientRef === 'string' && body.patientRef.trim().length > 0
        ? body.patientRef.trim()
        : null;
    const requestType =
      typeof body.requestType === 'string' && body.requestType.trim().length > 0
        ? body.requestType.trim()
        : null;
    const callbackPreference =
      typeof body.callbackPreference === 'string' && body.callbackPreference.trim().length > 0
        ? body.callbackPreference.trim()
        : null;

    const draft = insertDraft({
      id,
      submissionId,
      rawNote,
      patientRef,
      requestType,
      callbackPreference,
      status: 'draft',
      pmsReference: null,
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
