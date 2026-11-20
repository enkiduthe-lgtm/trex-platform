'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { financeDateTime } from '../lib/finance-report';
import styles from './portal.module.css';

type Tracking = {
  order_number: string; provider: string; status: string; tracking_number: string | null;
  tracking_checked_at: string | null; tracking_error: string | null;
  dispatched_at: string | null; delivered_at: string | null;
  events: { id: string; status: string; description: string | null; occurred_at: string }[];
};
const statuses: Record<string,string> = {
  CREATED:'Kargo kaydı hazır',IN_TRANSIT:'Kargoda',DELIVERED:'Teslim edildi',
  CARRIER_RETURN:'Kargo iadesi',FAILED:'Teslimat sorunu',CANCELLED:'İptal edildi',
};

export function TrackingPanel({orderId,onClose}:{orderId:string;onClose:()=>void}) {
  const [data,setData]=useState<Tracking|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refreshRef=useRef<(()=>Promise<void>)|null>(null);
  useEffect(()=>{
    let active=true,inFlight=false;
    setData(null);setError('');
    const refresh=async()=>{
      if(inFlight)return;
      inFlight=true;setBusy(true);
      try {
        const result=await api<Tracking>(`/dealer-portal/orders/${orderId}/tracking`);
        if(active){setData(result);setError('');}
      } catch(reason) {
        if(active)setError(reason instanceof Error?reason.message:'Kargo hareketleri yüklenemedi.');
      } finally {inFlight=false;if(active)setBusy(false);}
    };
    const refreshVisible=()=>{if(document.visibilityState==='visible')void refresh();};
    refreshRef.current=refresh;
    void refresh();
    const timer=window.setInterval(refreshVisible,30_000);
    window.addEventListener('focus',refreshVisible);
    return ()=>{
      active=false;
      window.clearInterval(timer);
      window.removeEventListener('focus',refreshVisible);
      if(refreshRef.current===refresh)refreshRef.current=null;
    };
  },[orderId]);
  return <section id="bayi-kargo-hareketleri" className={styles.box} aria-label="Kargo hareketleri" tabIndex={-1}>
    <div className={styles.header}>
      <div><h2>{data?.order_number??'Sipariş'} · Kargo hareketleri</h2>
        {data&&<span className={styles.statusBadge}>{statuses[data.status]??data.status}</span>}
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={()=>void refreshRef.current?.()}>{busy?'Yenileniyor…':'Takip Bilgilerini Yenile'}</button>
        <button type="button" className="secondary" onClick={onClose}>Kapat</button>
      </div>
    </div>
    {error&&<p className="notice" role="alert">{error}{data&&' Son yüklenen bilgiler gösteriliyor.'}</p>}
    {!data&&busy&&<p role="status">Kargo bilgileri yükleniyor…</p>}
    {data&&<>
      <div className={styles.grid}>
        <p><b>Kargo firması</b><br/>{data.provider==='aras'?'Aras Kargo':data.provider}</p>
        <p><b>Takip numarası</b><br/>{data.tracking_number??'Şube kabulü ve takip numarası bekleniyor.'}</p>
        <p><b>Son Aras kontrolü</b><br/>{data.tracking_checked_at?financeDateTime(data.tracking_checked_at):'Henüz kontrol edilmedi.'}</p>
        {data.dispatched_at&&<p><b>Kargoya veriliş</b><br/>{financeDateTime(data.dispatched_at)}</p>}
        {data.status==='DELIVERED'&&data.delivered_at&&<p><b>Teslimat</b><br/>{financeDateTime(data.delivered_at)}</p>}
      </div>
      {data.tracking_error&&<p className="notice" role="status">{data.tracking_error}</p>}
      <div className={styles.table}><table>
        <thead><tr><th>Tarih</th><th>Durum</th><th>Hareket</th></tr></thead>
        <tbody>{data.events.map(event=><tr key={event.id}>
          <td>{financeDateTime(event.occurred_at)}</td><td>{statuses[event.status]??event.status}</td><td>{event.description??'—'}</td>
        </tr>)}{!data.events.length&&<tr><td colSpan={3}>Henüz kaydedilmiş kargo hareketi yok.</td></tr>}</tbody>
      </table></div>
    </>}
  </section>;
}
