'use client';
import { useEffect, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
type Order={id:string;order_number:string;status:string;total_amount:string;currency:string;created_at:string;customer_email:string|null};
export default function Wholesale(){const [orders,setOrders]=useState<Order[]>([]),[message,setMessage]=useState('');useEffect(()=>{api<Order[]>('/admin/orders?channel=WHOLESALE').then(setOrders).catch(e=>setMessage(e.message));},[]);return <main><AdminNav/><section><p>TOPTAN SATIŞ</p><h1>Toptan operasyonu</h1><p>Bu ekran, toptan müşteriler için özel fiyat, vadeli/cari tahsilat ve toplu sipariş operasyonlarının merkezi olacaktır.</p>{message&&<p role="status">{message}</p>}<div className="cards">{orders.map(o=><article key={o.id}><p>{o.status} · {new Date(o.created_at).toLocaleDateString('tr-TR')}</p><h2>{o.order_number}</h2><p>{Number(o.total_amount).toLocaleString('tr-TR',{style:'currency',currency:o.currency})}</p><p>{o.customer_email??'Müşteri bilgisi yok'}</p></article>)}</div></section></main>}
