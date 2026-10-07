'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../../components/admin-nav';
import { api } from '../../../lib/api';
import styles from '../../orders.module.css';
type Detail={order_number:string;items:{id:string;product_name:string;quantity:number;unit_amount:string}[]};
export default function EditOrderPrices() {
  const {id}=useParams<{id:string}>(); const router=useRouter();
  const [data,setData]=useState<Detail|null>(null);const [amounts,setAmounts]=useState<Record<string,string>>({});const [reason,setReason]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
  useEffect(()=>{api<Detail>(`/admin/orders/${id}`).then(value=>{setData(value);setAmounts(Object.fromEntries(value.items.map(item=>[item.id,item.unit_amount])))}).catch(error=>setMessage(error instanceof Error?error.message:'Sipariş yüklenemedi'))},[id]);
  async function submit(event:FormEvent){event.preventDefault();if(lock.current||!data)return;lock.current=true;setBusy(true);setMessage('');try{await api(`/admin/orders/${id}/prices`,{method:'PATCH',body:JSON.stringify({reason,items:data.items.map(item=>({itemId:item.id,unitAmount:Number(amounts[item.id])}))})});router.push(`/siparisler/${id}`)}catch(error){setMessage(error instanceof Error?error.message:'Fiyatlar güncellenemedi');lock.current=false;setBusy(false)}}
  return <main><AdminNav/><section className={styles.page}><Link href={`/siparisler/${id}`}>← Sipariş detayı</Link><h1>Sipariş fiyatlarını değiştir {data?.order_number}</h1><p className={styles.notice}>Yalnız yönetici siparişleri için geçerlidir. Tahsilat yapılmış, paketlenmiş veya gönderilmiş siparişlerin fiyatı değiştirilemez. Ürünlerin genel fiyatları ve stok adetleri etkilenmez.</p>{message&&<p role="alert">{message}</p>}{data&&<form className={styles.newOrder} onSubmit={submit}><fieldset disabled={busy}><legend>Birim fiyatlar (TL)</legend>{data.items.map(item=><label key={item.id}>{item.product_name} · {item.quantity} adet<input required type="number" min={0} max={9999999999.99} step="0.01" value={amounts[item.id]??''} onChange={event=>setAmounts({...amounts,[item.id]:event.target.value})}/></label>)}<p>Yeni toplam: {data.items.reduce((sum,item)=>sum+Number(amounts[item.id])*item.quantity,0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'})}</p><label>Değişiklik nedeni<input required maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label><button type="submit">{busy?'Kaydediliyor…':'Fiyatları kaydet'}</button></fieldset></form>}</section></main>;
}
