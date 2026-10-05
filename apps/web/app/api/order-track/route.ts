import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const api = process.env.TREX_API_URL?.replace(/\/$/, '');
  if (!api) return NextResponse.json({ message: 'Sipariş servisi henüz hazır değil.' }, { status: 503 });
  const body = await request.json() as { number?: string; email?: string };
  const number = body.number?.trim(); const email = body.email?.trim();
  if (!number || !email) return NextResponse.json({ message: 'Sipariş numarası ve e-posta gerekli.' }, { status: 400 });
  const response = await fetch(`${api}/v1/orders/track?number=${encodeURIComponent(number)}&email=${encodeURIComponent(email)}`, { cache: 'no-store' });
  const data: unknown = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
