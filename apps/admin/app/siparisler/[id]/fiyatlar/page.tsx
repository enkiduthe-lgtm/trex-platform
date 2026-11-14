'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../../components/admin-nav';
import { useOrderPermissions } from '../../../lib/use-order-permissions';
import { api } from '../../../lib/api';
import styles from '../../orders.module.css';
type Detail={order_number:string;currency:string;cod_service_fee?:string;price_editable:boolean;items:{id:string;product_name:string;quantity:number;unit_amount:string}[]};
export default function EditOrderPrices() {
  const { permissions, role, loading: accessLoading, error: accessError } = useOrderPermissions();
  const {id}=useParams<{id:string}>(); const router=useRouter();
  const [data,setData]=useState<Detail|null>(null);const [amounts,setAmounts]=useState<Record<string,string>>({});const [reason,setReason]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
  const authorized = !accessLoading && permissions.edit && role === 'SUPER_ADMIN';
  useEffect(() => {
    if (!authorized) return;
    let active = true;
    api<Detail>(`/admin/orders/${id}`).then(value => {
      if (!active) return;
      setData(value);
      setAmounts(Object.fromEntries(value.items.map(item => [item.id, item.unit_amount])));
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Sipariş yüklenemedi'); });
    return () => { active = false; };
  }, [id, authorized]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !data?.price_editable || !authorized) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await api(`/admin/orders/${id}/prices`, { method: 'PATCH', body: JSON.stringify({
        reason, items: data.items.map(item => ({ itemId: item.id, unitAmount: Number(amounts[item.id]) })),
      }) });
      router.push(`/siparisler/${id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Fiyatlar güncellenemedi');
      lock.current = false;
      setBusy(false);
    }
  }

  const serviceFee = Number(data?.cod_service_fee ?? 0);
  const total = data?.items.reduce((sum, item) => sum + Number(amounts[item.id]) * item.quantity, serviceFee);
  const money = (amount: number) => amount.toLocaleString('tr-TR', { style: 'currency', currency: data?.currency ?? 'TRY' });
  return <main><AdminNav/><section className={styles.page}>
    <Link href={`/siparisler/${id}`}>← Sipariş detayı</Link>
    <h1>Sipariş fiyatlarını değiştir {data?.order_number}</h1>
    {accessLoading && <p role="status">İşlem yetkileri kontrol ediliyor…</p>}
    {!accessLoading && !authorized && <p role="alert">{accessError || 'Sipariş fiyatını yalnız Müdür değiştirebilir.'}</p>}
    {message && <p role="alert">{message}</p>}
    {authorized && !data && !message && <p role="status">Sipariş yükleniyor…</p>}
    {authorized && data && !data.price_editable && <p className={styles.notice}>Bu siparişin birim fiyatları değişikliğe kapalı.</p>}
    {authorized && data?.price_editable && <form className={styles.newOrder} onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>Birim fiyatlar ({data.currency})</legend>
        {data.items.map(item => <label key={item.id}>{item.product_name} · {item.quantity} adet
          <input required type="number" min={0} max={9999999999.99} step="0.01" value={amounts[item.id] ?? ''} onChange={event => setAmounts({ ...amounts, [item.id]: event.target.value })}/>
        </label>)}
        {serviceFee > 0 && <p>Kapıda ödeme hizmet bedeli {money(serviceFee)}</p>}
        <p>Yeni toplam {money(total ?? 0)}</p>
        <label>Değişiklik nedeni<input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></label>
        <button type="submit">{busy ? 'Kaydediliyor…' : 'Fiyatları kaydet'}</button>
      </fieldset>
    </form>}
  </section></main>;
}
