'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../../components/admin-nav';
import { api } from '../../../lib/api';
import styles from '../../orders.module.css';

type Detail={order_number:string;currency:string;financial_editable:boolean;edit_version:string;contact_email:string|null;customer_email:string|null;address:{recipient_name:string;phone:string;city:string;district:string;address_line:string;postal_code:string|null}|null;items:{id:string;product_name:string;quantity:number;unit_amount:string}[]};
export default function EditOrder(){
  const {id}=useParams<{id:string}>();const router=useRouter();const lock=useRef(false);
  const [data,setData]=useState<Detail|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({recipientName:'',contactEmail:'',phone:'',city:'',district:'',addressLine:'',postalCode:'',reason:''});
  const [items,setItems]=useState<{itemId:string;quantity:string;unitAmount:string}[]>([]);
  useEffect(()=>{let active=true;api<Detail>(`/admin/orders/${id}`).then(value=>{if(!active)return;if(!value.address)throw new Error('Sipariş adresi eksik');setData(value);setForm({recipientName:value.address.recipient_name,contactEmail:value.contact_email??value.customer_email??'',phone:value.address.phone,city:value.address.city,district:value.address.district,addressLine:value.address.address_line,postalCode:value.address.postal_code??'',reason:''});setItems(value.items.map(item=>({itemId:item.id,quantity:String(item.quantity),unitAmount:item.unit_amount})))}).catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Sipariş yüklenemedi')});return()=>{active=false}},[id]);
  async function submit(event:FormEvent){event.preventDefault();if(lock.current||!data)return;lock.current=true;setBusy(true);setMessage('');try{await api(`/admin/orders/${id}`,{method:'PATCH',body:JSON.stringify({...form,version:data.edit_version,items:items.map(item=>({...item,quantity:Number(item.quantity),unitAmount:Number(item.unitAmount)}))})});router.push(`/siparisler/${id}`)}catch(error){setMessage(error instanceof Error?error.message:'Sipariş kaydedilemedi');lock.current=false;setBusy(false)}}
  const total=items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unitAmount),0);
  return <main><AdminNav/><section className={styles.page}><Link href={`/siparisler/${id}`}>← Sipariş detayı</Link><h1>Siparişi düzenle {data?.order_number}</h1><p className={styles.notice}>Müşteri/teslimat bilgileri, ürün adetleri ve siparişe özel fiyatlar düzenlenir. Ödeme yöntemi, para birimi ve depo korunur. Adet değişince ayrılan stok birlikte güncellenir; yetersiz stokta hiçbir değişiklik kaydedilmez. Tahsilat veya depo işlemi başladıysa yalnız müşteri ve teslimat bilgileri düzeltilebilir.</p>{message&&<p role="alert">{message}</p>}{!data&&!message&&<p>Yükleniyor…</p>}{data&&<form className={styles.newOrder} onSubmit={submit}><fieldset disabled={busy}><legend>Müşteri ve teslimat</legend><div className={styles.formGrid}>
    <label>Ad soyad<input required maxLength={160} value={form.recipientName} onChange={e=>setForm({...form,recipientName:e.target.value})}/></label>
    <label>E-posta<input required type="email" maxLength={254} value={form.contactEmail} onChange={e=>setForm({...form,contactEmail:e.target.value})}/></label>
    <label>Telefon<input required maxLength={40} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
    <label>İl<input required maxLength={100} value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label>
    <label>İlçe<input required maxLength={100} value={form.district} onChange={e=>setForm({...form,district:e.target.value})}/></label>
    <label>Posta kodu<input maxLength={20} value={form.postalCode} onChange={e=>setForm({...form,postalCode:e.target.value})}/></label>
    <label className={styles.fullWidth}>Adres<textarea required maxLength={500} value={form.addressLine} onChange={e=>setForm({...form,addressLine:e.target.value})}/></label>
  </div></fieldset><fieldset disabled={busy||!data.financial_editable}><legend>Ürün adetleri ve fiyatları ({data.currency})</legend>{items.map((item,index)=><div className={styles.formGrid} key={item.itemId}><p className={styles.fullWidth}>{data.items.find(line=>line.id===item.itemId)?.product_name}</p><label>Adet<input required type="number" min={1} max={100000} step={1} value={item.quantity} onChange={e=>setItems(current=>current.map((line,i)=>i===index?{...line,quantity:e.target.value}:line))}/></label><label>Birim fiyat<input required type="number" min={0} max={9999999999.99} step="0.01" value={item.unitAmount} onChange={e=>setItems(current=>current.map((line,i)=>i===index?{...line,unitAmount:e.target.value}:line))}/></label></div>)}<p>Yeni toplam: {total.toLocaleString('tr-TR',{style:'currency',currency:data.currency})}</p></fieldset><fieldset disabled={busy}><legend>Kaydet</legend><label>Değişiklik nedeni<input required maxLength={500} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label><button type="submit">{busy?'Kaydediliyor…':'Değişiklikleri kaydet'}</button></fieldset></form>}</section></main>;
}
