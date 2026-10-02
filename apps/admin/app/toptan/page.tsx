'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';

type Order = { id: string; order_number: string; status: string; total_amount: string; currency: string; created_at: string; customer_email: string | null };
const money = (value: number) => value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

export default function Wholesale() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => { api<Order[]>('/admin/orders?channel=WHOLESALE').then(setOrders).catch((error) => setMessage(error.message)); }, []);
  const totals = useMemo(() => ({ total: orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0), open: orders.filter((order) => !['DELIVERED', 'CANCELLED'].includes(order.status)).length }), [orders]);
  return <main><AdminNav/><section><p>TOPTAN SATIŞ</p><h1>Toptan operasyonu</h1><p>Toptan müşteriler için özel fiyat, vadeli/cari tahsilat ve toplu siparişler bu kanalda ayrı izlenir.</p>{message && <p role="status">{message}</p>}<div className="cards"><article><p>Toptan sipariş</p><h2>{orders.length}</h2></article><article><p>Toplam sipariş tutarı</p><h2>{money(totals.total)}</h2></article><article><p>Açık operasyon</p><h2>{totals.open}</h2></article></div>{orders.length === 0 ? <p>Henüz toptan sipariş yok.</p> : <div className="cards">{orders.map((order) => <article key={order.id}><p>{order.status} · {new Date(order.created_at).toLocaleDateString('tr-TR')}</p><h2>{order.order_number}</h2><p>{money(Number(order.total_amount))}</p><p>{order.customer_email ?? 'Müşteri bilgisi yok'}</p></article>)}</div>}</section></main>;
}
