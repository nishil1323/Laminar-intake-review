import { NextResponse } from 'next/server';
import { submitToPms } from '@/lib/pms-client';

export async function POST(request: Request) {
  try {
    let body: any;
    try {
      const text = await request.text();
      if (!text || text.trim() === '') {
        return NextResponse.json(
          { error: 'submissionId, patientRef, and requestType are required' },
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
        { error: 'submissionId, patientRef, and requestType are required' },
        { status: 400 }
      );
    }

    const { submissionId, patientRef, requestType, callbackPreference } = body;

    if (
      typeof submissionId !== 'string' ||
      submissionId.trim() === '' ||
      typeof patientRef !== 'string' ||
      patientRef.trim() === '' ||
      typeof requestType !== 'string' ||
      requestType.trim() === ''
    ) {
      return NextResponse.json(
        { error: 'submissionId, patientRef, and requestType are required' },
        { status: 400 }
      );
    }

    const pmsEntry = submitToPms({
      submissionId: submissionId.trim(),
      patientRef: patientRef.trim(),
      requestType: requestType.trim(),
      callbackPreference:
        callbackPreference !== undefined && callbackPreference !== null
          ? String(callbackPreference).trim()
          : null,
    });

    return NextResponse.json(pmsEntry, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
