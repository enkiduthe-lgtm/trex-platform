'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import styles from '../orders.module.css';

type Detail={order_number:string;sales_channel:string;status:string;total_amount:string;currency:string;customer_email:string|null;contact_name:string|null;address:{recipient_name:string;phone:string;city:string;district:string;address_line:string;postal_code:string|null}|null;items:{id:string;product_name:string;sku:string;quantity:number;unit_amount:string;currency:string}[];payments:{id:string;provider:string;status:string;amount:string;currency:string;created_at:string;verified_at:string|null}[]};
const paymentStatus:Record<string,string>={SUCCEEDED:'Ödendi',PENDING:'Ödeme bekliyor',FAILED:'Başarısız',REFUNDED:'İade edildi'};
const paymentMethod:Record<string,string>={bank_transfer:'Havale / EFT',cash_on_delivery_card:'Kapıda ödeme — kart',cash_on_delivery_cash:'Kapıda ödeme — nakit',cash_on_delivery:'Kapıda ödeme',cash:'Nakit',paytr:'PayTR'};
const orderStatus:Record<string,string>={PAID:'Onaylandı',PENDING_PAYMENT:'Ödeme bekliyor',PROCESSING:'Hazırlanıyor',SHIPPED:'Kargoda',DELIVERED:'Teslim edildi',CANCELLED:'İptal edildi'};
const money=(v:string,c:string)=>Number(v).toLocaleString('tr-TR',{style:'currency',currency:c});
export default function OrderDetail(){
  const [canEdit,setCanEdit]=useState(false);
  useEffect(()=>{api<{user:{role:string}}>('/auth/me').then(value=>setCanEdit(['ADMIN','SUPER_ADMIN'].includes(value.user.role))).catch(()=>setCanEdit(false))},[]);
  const {id}=useParams<{id:string}>();const [data,setData]=useState<Detail|null>(null);const [error,setError]=useState('');
  useEffect(()=>{let active=true;setData(null);setError('');api<Detail>(`/admin/orders/${id}`).then(value=>{if(active)setData(value)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Sipariş yüklenemedi')});return()=>{active=false}},[id]);
  return <main><AdminNav/><section className={styles.page}><Link href="/siparisler">← Siparişler</Link><h1>Sipariş detayı {data?.order_number}</h1>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p>Yükleniyor…</p>}{data&&<>
    <p>Sipariş durumu: {orderStatus[data.status]??data.status} · Toplam: {money(data.total_amount,data.currency)}</p>
    <section className={styles.notice}><h2>Müşteri ve teslimat</h2><p>{data.contact_name??data.address?.recipient_name??'Ad bilgisi yok'} · {data.customer_email??'E-posta bilgisi yok'}</p>{data.address?<><p>Alıcı: {data.address.recipient_name} · Telefon: {data.address.phone}</p><p>{data.address.address_line}, {data.address.district} / {data.address.city} {data.address.postal_code}</p></>:<p>Teslimat adresi bulunamadı. Siparişi göndermeyin.</p>}</section>
    <p>Ödeme yöntemi: {data.payments.map(payment=>paymentMethod[payment.provider]??payment.provider).join(', ')||'Belirtilmedi'}</p>
    {canEdit&&data.sales_channel==='ADMIN_ORDER'&&['PENDING_PAYMENT','PROCESSING'].includes(data.status)&&data.payments.length>0&&data.payments.every(payment=>payment.status==='PENDING'&&['bank_transfer','cash_on_delivery_card','cash_on_delivery_cash'].includes(payment.provider))&&<Link className={styles.financeLink} href={`/siparisler/${id}/fiyatlar`}>Sipariş fiyatlarını değiştir</Link>}
    <h2>Ürünler</h2><div className={styles.tableWrap}><table><thead><tr><th>Ürün</th><th>SKU</th><th>Adet</th><th>Birim fiyat (sipariş anı)</th></tr></thead><tbody>{data.items.map(item=><tr key={item.id}><td>{item.product_name}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{money(item.unit_amount,item.currency)}</td></tr>)}</tbody></table></div>
    <h2>Ödeme hareketleri</h2><div className={styles.tableWrap}><table><thead><tr><th>Sağlayıcı</th><th>Durum</th><th>Tutar</th><th>Oluşturuldu</th><th>Doğrulandı</th></tr></thead><tbody>{data.payments.map(payment=><tr key={payment.id}><td>{payment.provider}</td><td>{paymentStatus[payment.status]??payment.status}</td><td>{money(payment.amount,payment.currency)}</td><td>{new Date(payment.created_at).toLocaleString('tr-TR')}</td><td>{payment.verified_at?new Date(payment.verified_at).toLocaleString('tr-TR'):'Henüz doğrulanmadı'}</td></tr>)}</tbody></table>{data.payments.length===0&&<p>Ödeme kaydı bulunamadı.</p>}</div>
  </>}</section></main>;
}
