'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { createRequestGate } from '../../lib/async-controls';
import styles from './alerts.module.css';

type Alert={code:string;title:string;detail:string|null;severity:'HIGH'|'MEDIUM'|'LOW'};
const labels:Record<Alert['severity'],string>={HIGH:'Yüksek',MEDIUM:'Orta',LOW:'Düşük'};
const limit=50;
export default function FinanceAlerts(){
  const [alerts,setAlerts]=useState<Alert[]>([]),[filter,setFilter]=useState<'ALL'|Alert['severity']>('ALL');
  const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[error,setError]=useState('');
  const alive=useRef(true),gate=useRef(createRequestGate());
  async function load(){
    const ticket=gate.current.begin();setLoading(true);setReady(false);setError('');
    try{
      const result=await api<Alert[]>('/admin/finance/alerts');
      if(!alive.current||!gate.current.isCurrent(ticket))return;
      if(!Array.isArray(result)||result.length>limit||result.some(item=>!item||typeof item.code!=='string'||typeof item.title!=='string'||!Object.hasOwn(labels,item.severity)||(item.detail!==null&&typeof item.detail!=='string')))throw new Error('Finans uyarıları doğrulanamadı.');
      setAlerts(result);setReady(true);
    }catch(reason){if(alive.current&&gate.current.isCurrent(ticket))setError(reason instanceof Error?reason.message:'Finans uyarıları yüklenemedi.');}
    finally{if(alive.current&&gate.current.isCurrent(ticket))setLoading(false);}
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;gate.current.invalidate();};},[]);
  const shown=alerts.filter(item=>filter==='ALL'||item.severity===filter);
  return <main><AdminNav/><section className={styles.workspace}>
    <header className={styles.header}><div><p>FİNANS / OPERASYON UYARILARI</p><h1>Finans Kontrol Merkezi</h1></div><button type='button' className='secondary' disabled={loading} onClick={()=>void load()}>{loading?'Kontrol Ediliyor…':'Uyarıları Yenile'}</button></header>
    <p>Öncelik sırasına göre en fazla {limit} uyarı listelenir. Bu ekran otomatik düzeltme yapmaz; ilgili kaydı inceleyerek işlem yapın.</p>
    <nav className={styles.links} aria-label='Finans İşlemleri'><Link href='/finans'>Finans Özeti</Link><Link href='/finans/havaleler'>Bekleyen Havaleler</Link><Link href='/finans/masraflar'>Masraflar</Link></nav>
    {error&&<p className='notice' role='alert'>{error} Güncel durum doğrulanamadı. Önceki kayıtlar varsa aşağıda korunuyor; açık uyarı olmadığı sonucu çıkarılmamalı.</p>}
    {loading&&<p role='status'>Finans uyarıları kontrol ediliyor…</p>}
    <div className={styles.metrics}><article><p>Yüklenen Uyarı</p><h2>{ready?alerts.length:'—'}</h2></article><article><p>Yüklenen Yüksek Öncelik</p><h2>{ready?alerts.filter(item=>item.severity==='HIGH').length:'—'}</h2></article><article><p>Filtrede Görünen</p><h2>{ready?shown.length:'—'}</h2></article></div>
    {ready&&alerts.length===limit&&<p className='notice' role='status'>İlk {limit} uyarı gösteriliyor. Daha fazla kayıt bulunabilir; hesap ve tahsilat listelerini de inceleyin.</p>}
    <div className={styles.filters}><label>Öncelik<select value={filter} onChange={event=>setFilter(event.target.value as typeof filter)}><option value='ALL'>Tüm Öncelikler</option><option value='HIGH'>Yüksek</option><option value='MEDIUM'>Orta</option><option value='LOW'>Düşük</option></select></label>{!ready&&alerts.length>0&&<span>Son alınan liste · {shown.length} kayıt</span>}</div>
    <div className={styles.cards}>{shown.map((item,index)=><article key={item.code+'-'+index} className={[styles.card,styles[item.severity.toLowerCase() as 'high'|'medium'|'low']].join(' ')}><span className={styles.badge}>{labels[item.severity]} Öncelik</span><h2>{item.title}</h2><p>{item.detail||'İlgili kayıttan ayrıntıları kontrol edin.'}</p></article>)}</div>
    {!shown.length&&!loading&&<p className='empty-state'>{ready?(alerts.length?'Yüklenen uyarılarda bu önceliğe uyan kayıt yok.':'Bu kontrolde listelenen finans uyarısı yok.'):'Güncel finans uyarıları alınamadı. Yeniden kontrol edin.'}</p>}
  </section></main>;
}
