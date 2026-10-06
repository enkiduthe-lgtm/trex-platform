'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { readCart, CartItem, removeLegacyCartItems } from '../../lib/cart-store';

type CheckoutForm = { recipientName: string; contactEmail: string; phone: string; city: string; district: string; addressLine: string };
const emptyForm: CheckoutForm = { recipientName: '', contactEmail: '', phone: '', city: '', district: '', addressLine: '' };

export default function Checkout() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState('CARD');
  const [form, setForm] = useState<CheckoutForm>(emptyForm);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setItems(readCart()), []);
  const total = items.reduce((sum, item) => sum + (item.unitAmount ?? 0) * item.quantity, 0);
  const update = (key: keyof CheckoutForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault(); setNotice('');
    if (items.some((item) => !item.productId)) { setNotice('Sepetinde eski deneme ürünü var. Aşağıdaki düğmeyle kaldırıp gerçek ürünü tekrar ekleyebilirsin.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, paymentMethod: payment, items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })) }) });
      const data = await response.json() as { redirectUrl?: string | null; message?: string; orderNumber?: string | null; method?: string };
      if (!response.ok) { setNotice(data.message ?? 'Sipariş başlatılamadı.'); return; }
      if (data.redirectUrl) { window.location.assign(data.redirectUrl); return; }
      setNotice(data.orderNumber ? `Siparişin alındı: ${data.orderNumber}. ${payment === 'TRANSFER' ? 'Havale/EFT geldikten sonra onaylanacak.' : payment === 'COD' ? 'Kapıda ödeme ile teslimatta tahsil edilecek.' : 'Nakit ödeme için sipariş ekibi seninle iletişime geçecek.'}` : 'Sipariş oluşturuldu. Ödeme bağlantısı hazırlanamadı; yönetim panelinden kontrol edebilirsin.');
    } catch { setNotice('Bağlantı kurulamadı. Birkaç dakika sonra tekrar dene.'); }
    finally { setBusy(false); }
  }

  const hasLegacyItem = items.some((item) => !item.productId);
  function clearLegacy() { removeLegacyCartItems(); setItems(readCart()); setNotice('Eski deneme ürünü sepetten kaldırıldı. Şimdi gerçek ürünü ekleyebilirsin.'); }
  return <main className="products"><nav><Link href="/"><strong>TREX <span>TEA</span></strong></Link><Link href="/sepet">Sepete dön</Link></nav><section className="cart-panel"><p className="eyebrow">TESLİMAT VE ÖDEME</p><h1>Siparişini tamamla</h1>{!items.length ? <p>Sepetin boş. <Link href="/urunler">Ürünlere git</Link></p> : <form onSubmit={submit}><div className="form-grid"><label>Ad soyad<input required value={form.recipientName} onChange={(event) => update('recipientName', event.target.value)} /></label><label>E-posta<input required type="email" value={form.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} /></label><label>Telefon<input required value={form.phone} onChange={(event) => update('phone', event.target.value)} /></label><label>Şehir<input required value={form.city} onChange={(event) => update('city', event.target.value)} /></label><label>İlçe<input required value={form.district} onChange={(event) => update('district', event.target.value)} /></label><label className="wide">Teslimat adresi<textarea required value={form.addressLine} onChange={(event) => update('addressLine', event.target.value)} /></label></div><h2>Ödeme yöntemi</h2><label><input type="radio" checked={payment === 'CARD'} onChange={() => setPayment('CARD')} /> Kredi kartı</label><label><input type="radio" checked={payment === 'TRANSFER'} onChange={() => setPayment('TRANSFER')} /> Havale / EFT</label><label><input type="radio" checked={payment === 'COD'} onChange={() => setPayment('COD')} /> Kapıda ödeme</label><label><input type="radio" checked={payment === 'CASH'} onChange={() => setPayment('CASH')} /> Nakit</label><p><strong>Ara toplam: {total.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</strong></p><button disabled={busy}>{busy ? 'Ödeme sayfası açılıyor…' : 'Ödemeye geç'}</button></form>}{notice && <p role="status">{notice}</p>}{hasLegacyItem && <button type="button" onClick={clearLegacy}>Eski deneme ürünlerini sepetten kaldır</button>}</section></main>;
}
