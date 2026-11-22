import { NextResponse } from 'next/server';
import { getDraftById, getPmsEntryBySubmissionId, updateDraft } from '@/lib/db';

export async function POST(
  _request: Request,
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

    const draft = getDraftById(id);
    if (!draft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      );
    }

    const pmsEntry = getPmsEntryBySubmissionId(draft.submissionId);

    if (pmsEntry) {
      const updatedDraft = updateDraft(draft.id, {
        status: 'confirmed',
        pmsReference: pmsEntry.pmsReference,
      });

      return NextResponse.json(
        {
          draft: updatedDraft,
          pmsEntry,
          verified: true,
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        {
          draft,
          pmsEntry: null,
          verified: false,
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
