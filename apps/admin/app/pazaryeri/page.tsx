'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';

type Order = { id: string; order_number: string; status: string; total_amount: string; currency: string; created_at: string; marketplace_name: string | null; commission_amount: string; shipping_cost_amount: string };
const money = (value: number) => value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

export default function Marketplace() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => { api<Order[]>('/admin/orders?channel=MARKETPLACE').then(setOrders).catch((error) => setMessage(error.message)); }, []);
  const totals = useMemo(() => orders.reduce((result, order) => {
    const gross = Number(order.total_amount || 0); const commission = Number(order.commission_amount || 0); const shipping = Number(order.shipping_cost_amount || 0);
    return { gross: result.gross + gross, commission: result.commission + commission, shipping: result.shipping + shipping, net: result.net + gross - commission - shipping };
  }, { gross: 0, commission: 0, shipping: 0, net: 0 }), [orders]);

  return <main><AdminNav/><section><p>PAZAR YERİ YÖNETİMİ</p><h1>Pazar yeri siparişleri</h1><p>Trendyol, N11 ve Hepsiburada bağlantıları sağlanana kadar sipariş ve kesinti kayıtları buradan izlenir.</p>{message && <p role="status">{message}</p>}<div className="cards"><article><p>Brüt satış</p><h2>{money(totals.gross)}</h2></article><article><p>Komisyon kesintisi</p><h2>{money(totals.commission)}</h2></article><article><p>Kargo kesintisi</p><h2>{money(totals.shipping)}</h2></article><article><p>Net tahsilat</p><h2>{money(totals.net)}</h2></article></div>{orders.length === 0 ? <p>Henüz pazar yeri siparişi yok. Bağlantılar açılana kadar bu alan boş görünür.</p> : <div className="cards">{orders.map((order) => { const net = Number(order.total_amount) - Number(order.commission_amount || 0) - Number(order.shipping_cost_amount || 0); return <article key={order.id}><p>{order.marketplace_name ?? 'Pazar yeri'} · {order.status}</p><h2>{order.order_number}</h2><p>Brüt: {money(Number(order.total_amount))}</p><p>Komisyon: {money(Number(order.commission_amount || 0))} · Kargo: {money(Number(order.shipping_cost_amount || 0))}</p><p><strong>Net tahsilat: {money(net)}</strong></p></article>; })}</div>}</section></main>;
}
