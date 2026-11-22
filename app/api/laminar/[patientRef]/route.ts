import { NextResponse } from 'next/server';
import { getDraftsByPatientRef } from '@/lib/db';
import { LaminarProfileEntry, LaminarProfileResponse } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: { patientRef: string } }
) {
  try {
    const rawPatientRef = params?.patientRef;
    if (!rawPatientRef || typeof rawPatientRef !== 'string') {
      return NextResponse.json(
        { error: 'patientRef is required' },
        { status: 400 }
      );
    }

    let patientRef: string;
    try {
      patientRef = decodeURIComponent(rawPatientRef);
    } catch {
      patientRef = rawPatientRef;
    }

    const drafts = getDraftsByPatientRef(patientRef);

    const entries: LaminarProfileEntry[] = drafts.map((draft) => ({
      draftId: draft.id,
      submissionId: draft.submissionId,
      requestType: draft.requestType || '',
      callbackPreference: draft.callbackPreference,
      status: draft.status,
      pmsReference: draft.pmsReference,
      updatedAt: draft.updatedAt,
    }));

    const response: LaminarProfileResponse = {
      patientRef,
      entries,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
