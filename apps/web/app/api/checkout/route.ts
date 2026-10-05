import { NextResponse } from 'next/server';

type Item = { productId: string; quantity: number };
type CheckoutRequest = {
  items?: Item[];
  recipientName?: string;
  contactEmail?: string;
  phone?: string;
  city?: string;
  district?: string;
  addressLine?: string;
  paymentMethod?: 'CARD' | 'TRANSFER' | 'COD' | 'CASH';
};

function message(data: unknown, fallback: string) {
  return typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' ? data.message : fallback;
}

export async function POST(request: Request) {
  const api = process.env.TREX_API_URL?.replace(/\/$/, '');
  if (!api) return NextResponse.json({ message: 'Sipariş servisi henüz hazır değil.' }, { status: 503 });
  const body = await request.json() as CheckoutRequest;
  const items = Array.isArray(body.items) ? body.items.filter((item) => typeof item?.productId === 'string' && Number.isInteger(item.quantity) && item.quantity > 0) : [];
  if (!items.length) return NextResponse.json({ message: 'Sepette geçerli ürün bulunamadı.' }, { status: 400 });
  const required = ['recipientName', 'contactEmail', 'phone', 'city', 'district', 'addressLine'] as const;
  if (required.some((key) => !body[key]?.trim())) return NextResponse.json({ message: 'Teslimat bilgilerini eksiksiz doldur.' }, { status: 400 });

  try {
    const guestResponse = await fetch(`${api}/v1/carts/guest`, { method: 'POST', cache: 'no-store' });
    const guest = await guestResponse.json() as { id?: string; guestKey?: string };
    if (!guestResponse.ok || !guest.id || !guest.guestKey) return NextResponse.json({ message: 'Sepet oturumu oluşturulamadı.' }, { status: 502 });
    for (const item of items) {
      const add = await fetch(`${api}/v1/carts/${guest.id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-guest-key': guest.guestKey }, body: JSON.stringify(item), cache: 'no-store' });
      if (!add.ok) return NextResponse.json({ message: message(await add.json().catch(() => null), 'Ürün sepete eklenemedi.') }, { status: add.status });
    }
    const fulfillmentResponse = await fetch(`${api}/v1/checkout/fulfillment`, { cache: 'no-store' });
    const fulfillment = await fulfillmentResponse.json() as { id?: string };
    if (!fulfillmentResponse.ok || !fulfillment.id) return NextResponse.json({ message: 'Aktif teslimat deposu bulunamadı.' }, { status: 409 });
    const checkout = await fetch(`${api}/v1/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ cartId: guest.id, guestKey: guest.guestKey, warehouseId: fulfillment.id, recipientName: body.recipientName, contactEmail: body.contactEmail, phone: body.phone, city: body.city, district: body.district, addressLine: body.addressLine, reservationMinutes: 20 }), cache: 'no-store' });
    const checkoutData = await checkout.json() as { checkoutId?: string };
    if (!checkout.ok || !checkoutData.checkoutId) return NextResponse.json({ message: message(checkoutData, 'Stok veya sipariş bilgisi doğrulanamadı.') }, { status: checkout.status });
    const paymentMethod = body.paymentMethod ?? 'CARD';
    const payment = await fetch(`${api}/v1/payments/${paymentMethod === 'CARD' ? 'initialize' : 'manual'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paymentMethod === 'CARD' ? { checkoutId: checkoutData.checkoutId, guestKey: guest.guestKey } : { checkoutId: checkoutData.checkoutId, guestKey: guest.guestKey, method: paymentMethod }), cache: 'no-store' });
    const paymentData = await payment.json() as { redirectUrl?: string; orderNumber?: string; method?: string };
    if (!payment.ok) return NextResponse.json({ message: message(paymentData, 'Ödeme başlatılamadı.') }, { status: payment.status });
    return NextResponse.json({ redirectUrl: paymentData.redirectUrl ?? null, checkoutId: checkoutData.checkoutId, orderNumber: paymentData.orderNumber ?? null, method: paymentData.method ?? paymentMethod });
  } catch {
    return NextResponse.json({ message: 'Sipariş servisine şu an ulaşılamıyor.' }, { status: 503 });
  }
}
