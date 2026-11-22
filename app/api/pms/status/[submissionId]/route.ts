import { NextResponse } from 'next/server';
import { getPmsEntryBySubmissionId } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: { submissionId: string } }
) {
  try {
    const submissionId = params?.submissionId;
    if (!submissionId || typeof submissionId !== 'string') {
      return NextResponse.json(
        { error: 'submissionId is required' },
        { status: 400 }
      );
    }

    const entry = getPmsEntryBySubmissionId(submissionId);
    if (!entry) {
      return NextResponse.json({ found: false }, { status: 200 });
    }

    return NextResponse.json({ found: true, entry }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
