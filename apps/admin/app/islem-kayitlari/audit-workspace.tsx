'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { financeDateTime } from '../lib/finance-report';
import { downloadXlsx } from '../lib/xlsx';
import styles from './audit.module.css';

type Filter={action:string;entityType:string;entityId:string;from:string;to:string};
type Entry={id:string;action:string;entity_type:string;entity_id:string|null;created_at:string;actor_role:string|null;actor_user_id:string|null};
type Result={items:Entry[];page:number;hasMore:boolean};
const emptyFilter=():Filter=>({action:'',entityType:'',entityId:'',from:'',to:''});
const roles:Record<string,string>={SYSTEM:'Sistem',SUPER_ADMIN:'Müdür',ADMIN:'Yönetici',WAREHOUSE:'Depo',FINANCE:'Finans',CUSTOMER:'Müşteri',DEALER:'Bayi'};
const entities:Record<string,string>={order:'Sipariş',payment:'Ödeme',inventory:'Stok',return:'İade',shipment:'Kargo',user:'Hesap',session:'Oturum',dealer:'Bayi',campaign:'Kampanya',coupon:'Kupon',notification:'Bildirim'};
function businessDateTime(value:string){
  if(!value)return '';
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Geçerli bir tarih ve saat seçin.');
  const parsed=new Date(value+':00+03:00');
  if(!Number.isFinite(parsed.getTime())||new Date(parsed.getTime()+3*60*60*1000).toISOString().slice(0,16)!==value)throw new Error('Geçerli bir tarih ve saat seçin.');
  return parsed.toISOString();
}
function queryFor(filter:Filter,page:number){
  const from=businessDateTime(filter.from),to=businessDateTime(filter.to);
  if(from&&to&&from>=to)throw new Error('Bitiş saati başlangıç saatinden sonra olmalı.');
  const query=new URLSearchParams({page:String(page)});
  for(const [key,value] of Object.entries({...filter,from,to}))if(value.trim())query.set(key,value.trim());
  return query.toString();
}
export default function AuditWorkspace(){
  const [filter,setFilter]=useState<Filter>(emptyFilter),[applied,setApplied]=useState<Filter>(emptyFilter);
  const [page,setPage]=useState(1),[result,setResult]=useState<Result|null>(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const sequence=useRef(0),loadedQuery=useRef<string|null>(null);
  let query='',filterError='';try{query=queryFor(applied,page);}catch(e){filterError=e instanceof Error?e.message:'Tarih aralığı geçersiz.';}
  useEffect(()=>{
    const ticket=++sequence.current;loadedQuery.current=null;setLoading(true);setError('');
    if(!query){setResult(null);setError(filterError);setLoading(false);return;}
    api<Result>(`/admin/audit-logs?${query}`).then(data=>{
      if(sequence.current!==ticket)return;
      if(data?.page!==page||typeof data.hasMore!=='boolean'||!Array.isArray(data.items)||data.items.length>50||new Set(data.items.map(row=>row?.id)).size!==data.items.length||data.items.some(row=>!row||typeof row.id!=='string'||typeof row.action!=='string'||typeof row.entity_type!=='string'||row.entity_id!==null&&typeof row.entity_id!=='string'||row.actor_user_id!==null&&typeof row.actor_user_id!=='string'||row.actor_role!==null&&typeof row.actor_role!=='string'||!Number.isFinite(Date.parse(row.created_at))))throw new Error('İşlem kayıtları doğrulanamadı.');
      setResult(data);loadedQuery.current=query;
    }).catch(e=>{if(sequence.current===ticket)setError(e instanceof Error?e.message:'Kayıtlar yüklenemedi.');})
      .finally(()=>{if(sequence.current===ticket)setLoading(false);});
    return()=>{sequence.current++;};
  },[query,revision]);
  const ready=!loading&&!error&&loadedQuery.current===query&&Boolean(result);
  function search(event:FormEvent){event.preventDefault();try{queryFor(filter,1);setError('');setPage(1);setApplied({...filter});setRevision(value=>value+1);}catch(e){setError(e instanceof Error?e.message:'Tarih aralığı geçersiz.');}}
  function preset(entityType:string){const next={...filter,action:'',entityType,entityId:''};try{queryFor(next,1);setFilter(next);setApplied(next);setPage(1);setRevision(value=>value+1);}catch(e){setError(e instanceof Error?e.message:'Tarih aralığı geçersiz.');}}
  function reset(){const next=emptyFilter();setFilter(next);setApplied(next);setPage(1);setRevision(value=>value+1);}
  function exportPage(){
    if(!ready||!result?.items.length)return;
    downloadXlsx(`trex-islem-kayitlari-sayfa-${result.page}.xlsx`,'İşlem Kayıtları',[
      ['Kapsam','Yalnızca gösterilen sayfa'],['Sayfa',result.page],['Kayıt Adedi',result.items.length],['Saat Dilimi','Türkiye (UTC+03:00)'],
      ['İşlem Kodu Filtresi',applied.action||'Tümü'],['Kayıt Türü Filtresi',applied.entityType||'Tümü'],['Kayıt Kimliği Filtresi',applied.entityId||'Tümü'],['Başlangıç (dahil)',applied.from||'Sınır yok'],['Bitiş (hariç)',applied.to||'Sınır yok'],[],
      ['Tarih','İşlem Kodu','Kayıt Türü','Kayıt Kimliği','İşlemi Yapanın Güncel Rolü','Hesap Kimliği'],
      ...result.items.map(entry=>[financeDateTime(entry.created_at),entry.action,entities[entry.entity_type]??entry.entity_type,entry.entity_id??'',roles[entry.actor_role??'']??'Bilinmiyor',entry.actor_user_id??'']),
    ]);
  }
  return <main><AdminNav/><section className={styles.workspace}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>AYARLAR / İŞLEM GEÇMİŞİ</p><h1>İşlem Kayıtları</h1><p>Sipariş, ödeme, kargo ve hesap işlemlerini salt okunur kayıtlardan inceleyin.</p></div><div className={styles.actions}><button type="button" disabled={loading} onClick={()=>setRevision(value=>value+1)}>Kayıtları Yenile</button><button type="button" disabled={!ready||!result?.items.length} onClick={exportPage}>Bu Sayfayı Excel’e Aktar</button></div></header>
    <div className={styles.presets} aria-label="Hızlı kayıt filtreleri">{['order','payment','inventory','return','shipment','user','session'].map(type=><button type="button" key={type} className={applied.entityType===type?styles.active:''} disabled={loading} onClick={()=>preset(type)}>{entities[type]}</button>)}</div>
    <form className={styles.filter} onSubmit={search}><div className={styles.fields}>
      <label>İşlem Kodu<input maxLength={120} placeholder="order.admin.updated" value={filter.action} onChange={e=>setFilter(value=>({...value,action:e.target.value}))}/></label>
      <label>Kayıt Türü<input maxLength={120} placeholder="order" value={filter.entityType} onChange={e=>setFilter(value=>({...value,entityType:e.target.value}))}/></label>
      <label>Kayıt Kimliği<input maxLength={200} value={filter.entityId} onChange={e=>setFilter(value=>({...value,entityId:e.target.value}))}/></label>
      <label>Başlangıç Saati<input type="datetime-local" value={filter.from} onChange={e=>setFilter(value=>({...value,from:e.target.value}))}/></label>
      <label>Bitiş Saatinden Önce<input type="datetime-local" value={filter.to} onChange={e=>setFilter(value=>({...value,to:e.target.value}))}/></label>
    </div><div className={styles.filterFoot}><p>Tarihler Türkiye saatidir. İşlem kodu, tür ve kimlik tam eşleşmeyle aranır.</p><div className={styles.actions}><button disabled={loading}>Filtrele</button><button type="button" disabled={loading} onClick={reset}>Filtreleri Temizle</button></div></div></form>
    {loading&&<p className={styles.notice} role="status">İşlem kayıtları yükleniyor…</p>}{error&&<p className={styles.error} role="alert">{error} Listeyi yenileyerek tekrar deneyebilirsiniz.</p>}
    <section className={styles.card} aria-busy={loading}><div className={styles.cardHeading}><h2>İşlem Geçmişi</h2><span>{ready?`Sayfa ${result!.page} · ${result!.items.length} kayıt`:'Güncel liste bekleniyor'}</span></div><p>Hassas müşteri bilgileri, şifreler ve işlem ayrıntılarındaki gizli alanlar burada gösterilmez.</p>
      <div className={styles.tableWrap}><table><caption>Seçilen Filtrelerdeki Kayıtlar</caption><thead><tr><th>Tarih</th><th>İşlem Kodu</th><th>Kayıt Türü / Kimliği</th><th>İşlemi Yapan</th></tr></thead><tbody>{ready&&result!.items.map(entry=><tr key={entry.id}><td>{financeDateTime(entry.created_at)}</td><td><code>{entry.action}</code></td><td><strong>{entities[entry.entity_type]??entry.entity_type}</strong><small>{entry.entity_id??'Kimlik yok'}</small></td><td>{roles[entry.actor_role??'']??'Bilinmiyor'}{entry.actor_user_id&&<small>{entry.actor_user_id}</small>}</td></tr>)}{(!ready||!result?.items.length)&&<tr><td colSpan={4}>{loading?'Kayıtlar yükleniyor…':error?'Güncel kayıtlar alınamadı.':'Bu filtrelerde işlem kaydı bulunamadı.'}</td></tr>}</tbody></table></div>
      <footer className={styles.pagination}><span>Bir sayfada en fazla 50 kayıt gösterilir.</span><div className={styles.actions}><button type="button" disabled={!ready||page===1} onClick={()=>setPage(value=>value-1)}>Önceki Sayfa</button><button type="button" disabled={!ready||!result?.hasMore||page>=2000} onClick={()=>setPage(value=>value+1)}>Sonraki Sayfa</button></div></footer>
    </section>
  </section></main>;
}
