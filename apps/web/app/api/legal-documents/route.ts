import { NextResponse } from 'next/server';

export async function GET() {
  const api = process.env.TREX_API_URL?.replace(/\/$/, '');
  if (!api) return NextResponse.json([]);
  try {
    const response = await fetch(`${api}/v1/legal-documents`, { next: { revalidate: 300 } });
    return NextResponse.json(response.ok ? await response.json() : []);
  } catch { return NextResponse.json([]); }
}
