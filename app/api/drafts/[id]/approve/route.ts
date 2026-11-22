import { NextResponse } from 'next/server';
import { getDraftById, updateDraft } from '@/lib/db';
import { validateDraftApproval } from '@/lib/validation';
import { submitToPms } from '@/lib/pms-client';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id;
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Draft ID is required' },
        { status: 400 }
      );
    }

    const existingDraft = getDraftById(id);
    if (!existingDraft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      );
    }

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

    const validation = validateDraftApproval({
      patientRef: body.patientRef,
      requestType: body.requestType,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { errors: validation.errors },
        { status: 400 }
      );
    }

    const headerTimeout = request.headers.get('x-simulate-timeout')?.trim().toLowerCase();
    const isHeaderTimeout = headerTimeout === 'true' || headerTimeout === '1' || headerTimeout === 'yes';
    const isBodyTimeout = body.simulateTimeout === true || body.simulateTimeout === 'true' || body.simulateTimeout === 1;
    const isEnvTimeout = process.env.SIMULATE_PMS_TIMEOUT === 'true';
    const isTimeout = isHeaderTimeout || isBodyTimeout || isEnvTimeout;

    const patientRef = String(body.patientRef).trim();
    const requestType = String(body.requestType).trim();
    const callbackPreference =
      body.callbackPreference !== undefined && body.callbackPreference !== null
        ? String(body.callbackPreference).trim()
        : null;

    const pmsResult = submitToPms({
      submissionId: existingDraft.submissionId,
      patientRef,
      requestType,
      callbackPreference,
    });

    if (isTimeout) {
      const updatedDraft = updateDraft(existingDraft.id, {
        patientRef,
        requestType,
        callbackPreference,
        status: 'awaiting_confirmation',
        pmsReference: null,
      });

      return NextResponse.json(
        {
          draft: updatedDraft,
          message: 'Submitted but PMS confirmation timed out. Use verify to check status.',
        },
        { status: 202 }
      );
    } else {
      const updatedDraft = updateDraft(existingDraft.id, {
        patientRef,
        requestType,
        callbackPreference,
        status: 'confirmed',
        pmsReference: pmsResult.pmsReference,
      });

      return NextResponse.json(
        {
          draft: updatedDraft,
          pmsResult,
        },
        { status: 200 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
