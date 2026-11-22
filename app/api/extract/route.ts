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

    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.note !== 'string') {
      return NextResponse.json(
        { error: 'Note text is required' },
        { status: 400 }
      );
    }

    const extracted = await extractWithAgent(body.note);
    return NextResponse.json(extracted, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
