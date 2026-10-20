'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, clearToken, logout } from '../lib/api';

type Me = { user: { email: string; role: string } };
type Summary = { company_name: string; code: string; dealer_balance: string; available_commission: string; order_count: string };
type Order = { id: string; order_number: string; status: string; total_amount: string; currency: string; created_at: string };

const statusText: Record<string, string> = { PENDING_PAYMENT: 'Ödeme bekliyor', PROCESSING: 'Hazırlanıyor', SHIPPED: 'Kargoda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal edildi' };
const money = (amount: string, currency: string) => Number(amount).toLocaleString('tr-TR', { style: 'currency', currency });

export default function DealerPortal() {
  const [email, setEmail] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [me, dealer, dealerOrders] = await Promise.all([api<Me>('/auth/me'), api<Summary>('/dealer-portal/summary'), api<Order[]>('/dealer-portal/orders')]);
    if (me.user.role !== 'DEALER') throw new Error('Bu alan yalnızca bayi hesapları içindir.');
    setEmail(me.user.email); setSummary(dealer); setOrders(dealerOrders);
  }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : 'Bayi bilgileri yüklenemedi.')); }, []);
  async function cancel(order: Order) {
    if (!window.confirm(`${order.order_number} numaralı siparişi iptal etmek istiyor musunuz? Kargoya verilen siparişler iptal edilemez.`)) return;
    setBusy(order.id); setMessage('');
    try { await api(`/dealer-portal/orders/${order.id}/cancel`, { method: 'POST' }); setMessage('Sipariş iptal edildi.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Sipariş iptal edilemedi.'); }
    finally { setBusy(null); }
  }
  async function exit() { try { await logout(); } finally { clearToken(); window.location.assign('/giris'); } }

  return <main><section className="dealer-workspace">
    <p>BAYİ PORTALI</p><h1>{summary?.company_name ?? 'Bayi portalı'}</h1>
    {email && <p>{summary?.code ? `${summary.code} · ` : ''}{email}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {summary && <div className="cards dealer-summary-cards">
      <article><h2>Siparişlerim</h2><strong>{summary.order_count}</strong><p>Toplam bayi siparişi</p></article>
      <article><h2>Primlerim</h2><strong>{money(summary.available_commission, 'TRY')}</strong><p>Kesinleşen / kullanılabilir prim</p></article>
      <article><h2>Cari hesabım</h2><strong>{money(summary.dealer_balance, 'TRY')}</strong><p>Güncel bakiye</p></article>
    </div>}
    <div className="form-card"><h2>Siparişlerim</h2><p>Buradaki bayi siparişleri ana yönetim panelindeki Siparişler ekranına da düşer.</p>
      {orders.length === 0 ? <p className="empty">Henüz bayi siparişi yok.</p> : <div className="dense-table dealer-orders">{orders.map((order) => <div key={order.id}>
        <span><b>{order.order_number}</b><small>{new Date(order.created_at).toLocaleString('tr-TR')}</small></span>
        <span><b>{money(order.total_amount, order.currency)}</b><small>{statusText[order.status] ?? order.status}</small></span>
        {['PENDING_PAYMENT', 'PROCESSING'].includes(order.status) && <button type="button" onClick={() => void cancel(order)} disabled={busy !== null}>{busy === order.id ? 'İptal ediliyor…' : 'İptal et'}</button>}
      </div>)}</div>}
    </div>
    <div className="button-row"><Link className="secondary" href="/urunler">Ürünleri görüntüle</Link><button className="secondary" type="button" onClick={() => void exit()}>Güvenli çıkış</button></div>
  </section></main>;
}
