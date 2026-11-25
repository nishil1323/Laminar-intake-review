import { NextResponse } from 'next/server';
import { extractWithAgent } from '@/lib/gemini-agent';

export async function POST(request: Request) {
  try {
    let body: any;
    try {
      const text = await request.text();
      if (!text || text.trim() === '') {
        return NextResponse.json(
          { error: 'Note text is required' },
          { status: 400 }
        );
      }
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Note text is required' },
        { status: 400 }
      );
    }

    const hasNote = typeof body.note === 'string';
    const hasImage = Boolean(
      body.image &&
        (typeof body.image === 'string' ||
          (typeof body.image === 'object' && typeof body.image.data === 'string' && body.image.data.length > 0))
    );

    if (!hasNote && !hasImage) {
      return NextResponse.json(
        { error: 'Note text is required' },
        { status: 400 }
      );
    }

    if (body.note !== undefined && typeof body.note !== 'string') {
      return NextResponse.json(
        { error: 'Note text is required' },
        { status: 400 }
      );
    }

    let imageParam: { data: string; mimeType: string } | undefined = undefined;
    if (hasImage) {
      if (typeof body.image === 'string') {
        const mimeMatch = body.image.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const data = body.image.includes('base64,') ? body.image.split('base64,')[1] : body.image;
        imageParam = { data, mimeType };
      } else {
        imageParam = {
          data: body.image.data,
          mimeType: body.image.mimeType || 'image/jpeg',
        };
      }
    }

    const note = typeof body.note === 'string' ? body.note : '';
    const extracted = await extractWithAgent(note, imageParam);
    return NextResponse.json(extracted, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
