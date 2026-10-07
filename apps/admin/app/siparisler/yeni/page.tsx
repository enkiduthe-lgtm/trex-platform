'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import styles from '../orders.module.css';

type Options = {
  products: { id:string; name:string; sku:string; amount:string|null; currency:string|null }[];
  warehouses: { id:string; name:string }[];
  customers: { id:string; email:string; first_name:string; last_name:string; phone:string|null }[];
};
const money = (value:number) => value.toLocaleString('tr-TR',{style:'currency',currency:'TRY'});
export default function NewOrder() {
  const router = useRouter();
  const [options,setOptions] = useState<Options|null>(null);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const attempt = useRef<{ payload:string; key:string }|null>(null);
  const [form,setForm] = useState({ customerId:'',warehouseId:'',recipientName:'',contactEmail:'',phone:'',city:'',district:'',addressLine:'',postalCode:'',paymentMethod:'TRANSFER',priceChangeReason:'' });
  const [items,setItems] = useState([{ productId:'',quantity:1,unitAmount:'' }]);
  useEffect(() => {
    api<Options>('/admin/orders/creation-options').then(setOptions).catch(error => setMessage(error instanceof Error ? error.message : 'Sipariş bilgileri yüklenemedi'));
  },[]);
  function chooseCustomer(id:string) {
    const customer = options?.customers.find(item => item.id===id);
    setForm(current => ({ ...current,customerId:id,recipientName:customer ? `${customer.first_name} ${customer.last_name}` : '',contactEmail:customer?.email ?? '',phone:customer?.phone ?? '' }));
  }
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(lock.current) return;
    lock.current=true; setBusy(true); setMessage('');
    const payload = JSON.stringify({ ...form,priceChangeReason:form.priceChangeReason || undefined,customerId:form.customerId || undefined,items:items.map(item=>({...item,unitAmount:item.unitAmount===''?undefined:Number(item.unitAmount)})) });
    if(attempt.current?.payload!==payload) attempt.current={ payload,key:crypto.randomUUID() };
    try {
      const result = await api<{ id:string }>('/admin/orders',{ method:'POST',headers:{ 'Idempotency-Key':attempt.current.key },body:payload });
      router.push(`/siparisler/${result.id}`);
    } catch(error) {
      setMessage(error instanceof Error ? error.message : 'Sipariş oluşturulamadı');
      lock.current=false; setBusy(false);
    }
  }
  const total = items.reduce((sum,item) => sum+Number(item.unitAmount!==''?item.unitAmount:options?.products.find(product => product.id===item.productId)?.amount ?? 0)*item.quantity,0);
  const unavailable = !options || !options.warehouses.length || !options.products.some(product => product.amount!==null&&product.currency?.trim()==='TRY');
  return <main><AdminNav/><section className={styles.page}>
    <Link href="/siparisler">← Siparişler</Link><h1>Yeni yönetici siparişi</h1>
    <p className={styles.notice}>Stok sipariş için ayrılır. Havale siparişleri tahsilat onayını bekler. Kapıda ödeme siparişleri depoya hazırlanmak üzere gönderilir; ödeme, teslimatta tahsil edilip finans tarafından onaylanana kadar bekliyor görünür.</p>
    {message&&<p role="alert" className={styles.notice}>{message}</p>}
    {!options&&!message&&<p>Yükleniyor…</p>}
    {options&&<form onSubmit={submit} className={styles.newOrder}>
      <fieldset disabled={busy||unavailable}><legend>Müşteri ve teslimat</legend><div className={styles.formGrid}>
        <label>Müşteri<select value={form.customerId} onChange={event=>chooseCustomer(event.target.value)}><option value="">Yeni / misafir müşteri</option>{options.customers.map(customer=><option key={customer.id} value={customer.id}>{customer.first_name} {customer.last_name} · {customer.email}</option>)}</select></label>
        <label>Depo<select required value={form.warehouseId} onChange={event=>setForm({...form,warehouseId:event.target.value})}><option value="">Depo seçin</option>{options.warehouses.map(warehouse=><option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <label>Alıcı adı<input required maxLength={160} value={form.recipientName} onChange={event=>setForm({...form,recipientName:event.target.value})}/></label>
        <label>E-posta<input required type="email" maxLength={254} value={form.contactEmail} onChange={event=>setForm({...form,contactEmail:event.target.value})}/></label>
        <label>Telefon<input required type="tel" maxLength={40} value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})}/></label>
        <label>İl<input required maxLength={100} value={form.city} onChange={event=>setForm({...form,city:event.target.value})}/></label>
        <label>İlçe<input required maxLength={100} value={form.district} onChange={event=>setForm({...form,district:event.target.value})}/></label>
        <label>Posta kodu<input maxLength={20} value={form.postalCode} onChange={event=>setForm({...form,postalCode:event.target.value})}/></label>
        <label className={styles.fullWidth}>Teslimat adresi<textarea required maxLength={500} value={form.addressLine} onChange={event=>setForm({...form,addressLine:event.target.value})}/></label>
      </div></fieldset>
      {unavailable&&<p role="alert">Önce aktif bir depo ve TL fiyatı olan aktif ürün ekleyin.</p>}
      <fieldset disabled={busy||unavailable}><legend>Ürünler</legend>
        {items.map((item,index)=>{const product=options.products.find(value=>value.id===item.productId);return <div key={index} className={styles.itemRow}>
          <label>Ürün<select required value={item.productId} onChange={event=>setItems(current=>current.map((value,i)=>i===index?{...value,productId:event.target.value,unitAmount:''}:value))}><option value="">Ürün seçin</option>{options.products.filter(value=>value.amount!==null&&value.currency?.trim()==='TRY').map(value=><option key={value.id} value={value.id} disabled={items.some((line,i)=>i!==index&&line.productId===value.id)}>{value.name} · {value.sku} · {money(Number(value.amount))}</option>)}</select></label>
          <label>Adet<input required type="number" min={1} max={100000} step={1} value={item.quantity} onChange={event=>setItems(current=>current.map((value,i)=>i===index?{...value,quantity:Number(event.target.value)}:value))}/></label>
          <label>Özel birim fiyat (TL)<input type="number" min={0} max={9999999999.99} step="0.01" placeholder={product?.amount??'Sistem fiyatı'} value={item.unitAmount} onChange={event=>setItems(current=>current.map((value,i)=>i===index?{...value,unitAmount:event.target.value}:value))}/></label>
          <span>{money(Number(item.unitAmount!==''?item.unitAmount:product?.amount ?? 0)*item.quantity)}</span>
          <button type="button" disabled={items.length===1} onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))}>Kaldır</button>
        </div>})}
        <button type="button" disabled={items.length>=100} onClick={()=>setItems(current=>[...current,{productId:'',quantity:1,unitAmount:''}])}>+ Ürün ekle</button>
        <p>Özel fiyatı boş bırakırsanız sistem fiyatı kullanılır. Buradaki fiyat yalnız bu siparişi etkiler.</p>
        {items.some(item=>item.unitAmount!=='')&&<label>Fiyat değişiklik nedeni<input required maxLength={500} value={form.priceChangeReason} onChange={event=>setForm({...form,priceChangeReason:event.target.value})}/></label>}
      </fieldset>
      <fieldset disabled={busy||unavailable}><legend>Ödeme</legend><label>Ödeme yöntemi<select value={form.paymentMethod} onChange={event=>setForm({...form,paymentMethod:event.target.value})}><option value="TRANSFER">Havale / EFT</option><option value="COD_CARD">Kapıda ödeme — kart</option><option value="COD_CASH">Kapıda ödeme — nakit</option></select></label><p>Tahmini toplam: <strong>{money(total)}</strong> · Kesin fiyat ve stok kayıt sırasında doğrulanır.</p><button type="submit">{busy?'Kaydediliyor…':'Siparişi oluştur'}</button></fieldset>
    </form>}
  </section></main>;
}
