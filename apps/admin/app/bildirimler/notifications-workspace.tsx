'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { useOrderPermissions } from '../lib/use-order-permissions';
import { useFinanceSubmission } from '../lib/use-finance-submission';
import { createActionLock, createRequestGate } from '../lib/async-controls';
import { financeDateTime } from '../lib/finance-report';
import { downloadXlsx } from '../lib/xlsx';
import styles from './notifications.module.css';

type Channel='IN_APP'|'EMAIL'|'SMS'|'PUSH';
type Filters={q:string;channel:string;status:string};
type Item={id:string;channel:Channel;recipient:string;subject:string|null;body:string;status:string;created_at:string;sent_at:string|null;attempt_count:number;last_attempt_at:string|null;next_attempt_at:string|null;failure_reason:string|null;delivery_mode:'IN_APP'|'MOCK'|'BREVO'|null;is_simulated:boolean;can_retry:boolean;needs_review:boolean};
type Configuration={provider:string;simulated:boolean;queueConfigured:boolean;channels:{channel:Channel;available:boolean;reason:string}[]};
type Counts={total:number;sent:number;pending:number;failed:number;unknown:number};
type History={rows:Item[];next:string|null;counts:Counts;matchedCount:number;filters:Filters};
const emptyFilters:Filters={q:'',channel:'',status:''};
const channelNames:Record<string,string>={IN_APP:'Uygulama İçi',EMAIL:'E-posta',SMS:'SMS',PUSH:'Push'};
const statusNames:Record<string,string>={PENDING:'İletim Bekliyor',RETRYING:'İşleniyor',SENT:'Kayıt Tamamlandı',FAILED:'İletim Başarısız',UNKNOWN:'Sonuç Doğrulanamadı'};
const sameFilters=(a:Filters,b:Filters)=>a.q.trim()===b.q.trim()&&a.channel===b.channel&&a.status===b.status;
function stateLabel(item:Item){return item.status==='SENT'?(item.is_simulated?'Test Kaydı Tamamlandı':item.channel==='IN_APP'?'Uygulama İçinde Kaydedildi':item.delivery_mode==='BREVO'?'Sağlayıcıya İletildi':'İletim Kaydı Kontrol Edilmeli'):statusNames[item.status]??'Kontrol Bekliyor';}
function modeLabel(item:Item){return item.is_simulated?'Test Kaydı':item.delivery_mode==='BREVO'?'Canlı E-posta':item.channel==='IN_APP'?'Uygulama İçi':'İletim Türü Kontrol Edilmeli';}
function historyUrl(filters:Filters,before?:string){const query=new URLSearchParams();if(filters.q.trim())query.set('q',filters.q.trim());if(filters.channel)query.set('channel',filters.channel);if(filters.status)query.set('status',filters.status);if(before)query.set('before',before);return '/admin/notifications/history?'+query;}
function validPage(value:History,snapshot:Filters){return Boolean(value&&Array.isArray(value.rows)&&value.filters&&sameFilters(value.filters,snapshot)&&(value.next===null||typeof value.next==='string')&&Number.isInteger(value.matchedCount)&&value.matchedCount>=value.rows.length&&value.counts&&['total','sent','pending','failed','unknown'].every(key=>Number.isInteger(value.counts[key as keyof Counts])&&value.counts[key as keyof Counts]>=0));}

export default function NotificationsWorkspace(){
  const {permissions,loading:accessLoading,error:accessError,refresh:refreshPermissions}=useOrderPermissions();
  const submission=useFinanceSubmission('/admin/notifications/idempotent','id','Bildirim');
  const [items,setItems]=useState<Item[]>([]),[configuration,setConfiguration]=useState<Configuration|null>(null),[counts,setCounts]=useState<Counts|null>(null),[matchedCount,setMatchedCount]=useState(0),[next,setNext]=useState<string|null>(null);
  const [filters,setFilters]=useState<Filters>({...emptyFilters}),[applied,setApplied]=useState<Filters|null>(null);
  const [historyLoading,setHistoryLoading]=useState(true),[historyReady,setHistoryReady]=useState(false),[historyError,setHistoryError]=useState(''),[loadingOlder,setLoadingOlder]=useState(false),[olderError,setOlderError]=useState('');
  const [configurationLoading,setConfigurationLoading]=useState(true),[configurationReady,setConfigurationReady]=useState(false),[configurationError,setConfigurationError]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [form,setForm]=useState({channel:'IN_APP' as Channel,recipient:'Yönetim',subject:'',body:''});
  const alive=useRef(true),historyGate=useRef(createRequestGate()),configurationGate=useRef(createRequestGate()),activeTicket=useRef(0),actionLock=useRef(createActionLock()),olderLock=useRef(false);
  const historyRef=useRef<{ready:boolean;filters:Filters;next:string|null}>({ready:false,filters:{...emptyFilters},next:null}),configurationRef=useRef(false);
  const blocked=busy||submission.busy||Boolean(submission.pending);
  const filtersChanged=!applied||!sameFilters(filters,applied);
  const selectedChannel=configuration?.channels.find(item=>item.channel===form.channel);
  function stopOldHistory(){activeTicket.current=historyGate.current.begin();olderLock.current=false;setHistoryLoading(false);setLoadingOlder(false);}
  async function loadConfiguration(){
    const ticket=configurationGate.current.begin();configurationRef.current=false;setConfigurationReady(false);setConfigurationLoading(true);setConfigurationError('');
    try{const result=await api<Configuration>('/admin/notifications/configuration');if(!alive.current||!configurationGate.current.isCurrent(ticket))return false;
      if(!result||typeof result.simulated!=='boolean'||!Array.isArray(result.channels)||result.channels.length!==4||new Set(result.channels.map(item=>item.channel)).size!==4||result.channels.some(item=>!channelNames[item.channel]||typeof item.available!=='boolean'))throw new Error('Bildirim kanalları doğrulanamadı.');
      setConfiguration(result);setConfigurationReady(true);configurationRef.current=true;return true;
    }catch(error){if(alive.current&&configurationGate.current.isCurrent(ticket))setConfigurationError(error instanceof Error?error.message:'Bildirim kanalları alınamadı.');return false;}
    finally{if(alive.current&&configurationGate.current.isCurrent(ticket))setConfigurationLoading(false);}
  }
  async function loadHistory(snapshot:Filters=filters,afterWrite=false){
    if(actionLock.current.isLocked()&&!afterWrite)return false;
    const normalized={...snapshot,q:snapshot.q.trim()},ticket=historyGate.current.begin();activeTicket.current=ticket;historyRef.current.ready=false;olderLock.current=false;
    setHistoryReady(false);setHistoryLoading(true);setLoadingOlder(false);setHistoryError('');setOlderError('');
    try{const result=await api<History>(historyUrl(normalized));if(!alive.current||!historyGate.current.isCurrent(ticket))return false;
      if(!validPage(result,normalized))throw new Error('Bildirim geçmişi doğrulanamadı.');
      setItems(result.rows);setCounts(result.counts);setMatchedCount(result.matchedCount);setNext(result.next);setApplied(normalized);setHistoryReady(true);historyRef.current={ready:true,filters:normalized,next:result.next};return true;
    }catch(error){if(alive.current&&historyGate.current.isCurrent(ticket))setHistoryError(error instanceof Error?error.message:'Bildirim geçmişi yüklenemedi.');return false;}
    finally{if(alive.current&&historyGate.current.isCurrent(ticket))setHistoryLoading(false);}
  }
  async function refresh(){await Promise.all([loadConfiguration(),loadHistory()]);}
  useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;historyRef.current.ready=false;configurationRef.current=false;historyGate.current.invalidate();configurationGate.current.invalidate();};},[]);
  async function loadOlder(){
    const snapshot=historyRef.current;if(!snapshot.ready||!snapshot.next||olderLock.current||actionLock.current.isLocked()||submission.pending||filtersChanged)return;
    const ticket=activeTicket.current,cursor=snapshot.next;olderLock.current=true;setLoadingOlder(true);setOlderError('');
    try{const result=await api<History>(historyUrl(snapshot.filters,cursor));if(!alive.current||!historyGate.current.isCurrent(ticket)||historyRef.current.next!==cursor)return;
      if(!validPage(result,snapshot.filters)||result.next===cursor||result.rows.some(item=>item.id===cursor))throw new Error('Önceki bildirim sayfası doğrulanamadı.');
      setItems(current=>{const ids=new Set(current.map(item=>item.id));return [...current,...result.rows.filter(item=>!ids.has(item.id))];});setNext(result.next);setCounts(result.counts);setMatchedCount(result.matchedCount);historyRef.current.next=result.next;
    }catch(error){if(alive.current&&historyGate.current.isCurrent(ticket))setOlderError(error instanceof Error?error.message:'Önceki kayıtlar yüklenemedi.');}
    finally{if(alive.current&&historyGate.current.isCurrent(ticket)){olderLock.current=false;setLoadingOlder(false);}}
  }
  async function saveRecord(retry=false){
    if(!alive.current||accessLoading||!permissions.notificationCreate||actionLock.current.isLocked())return;
    if(!retry&&(!historyRef.current.ready||!configurationRef.current||submission.pending))return;
    if(!retry&&(!selectedChannel?.available||!form.recipient.trim()||!form.body.trim())){setMessage('Hazır bir kanal seçip alıcı ve mesaj alanlarını doldurun.');return;}
    if(!actionLock.current.acquire())return;stopOldHistory();setBusy(true);setMessage('');
    try{const result=retry?await submission.retry():await submission.send(JSON.stringify({channel:form.channel,recipient:form.recipient.trim(),subject:form.subject.trim()||undefined,body:form.body.trim()}));
      if(!alive.current)return;setForm(current=>({...current,recipient:current.channel==='IN_APP'?'Yönetim':'',subject:'',body:''}));setMessage(result.replayed?'Mevcut bildirim doğrulandı. Yeni kayıt oluşturulmadı.':'Bildirim kaydedildi. Güncel iletim durumu kayıt listesinde gösterilir.');await loadHistory(applied??filters,true);
    }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'Bildirim kaydı doğrulanamadı.');}
    finally{actionLock.current.release();if(alive.current)setBusy(false);}
  }
  async function submit(event:FormEvent){event.preventDefault();await saveRecord();}
  async function retryRecord(id:string){
    if(!alive.current||accessLoading||!permissions.notificationRetry||!historyRef.current.ready||submission.pending||actionLock.current.isLocked())return;
    if(!items.some(item=>item.id===id&&item.can_retry))return;if(!actionLock.current.acquire())return;stopOldHistory();setBusy(true);setMessage('');
    try{const result=await api<{id:string;status:string;queued:boolean}>('/admin/notifications/'+id+'/retry',{method:'POST'});if(!alive.current)return;
      if(result?.id!==id||!['SENT','PENDING'].includes(result.status))throw new Error('Yeniden deneme sonucu doğrulanamadı.');
      setMessage(result.status==='SENT'?'Bildirim kaydı tamamlandı.':result.queued?'Bildirim yeniden iletim kuyruğuna alındı.':'Bildirim yeniden işlenmek üzere kaydedildi. İletim bekliyor.');await loadHistory(applied??filters,true);
    }catch(error){if(alive.current){historyRef.current.ready=false;setHistoryReady(false);setMessage(error instanceof Error?error.message:'Yeniden deneme sonucu doğrulanamadı. Listeyi yenileyin.');}}
    finally{actionLock.current.release();if(alive.current)setBusy(false);}
  }
  function changeChannel(channel:Channel){if(actionLock.current.isLocked()||submission.pending)return;setForm(current=>({...current,channel,recipient:channel==='IN_APP'?'Yönetim':''}));}
  function exportRecords(){
    if(!historyReady||historyLoading||loadingOlder||filtersChanged||blocked||!applied||!items.length)return;
    downloadXlsx('trex-bildirimler.xlsx','Bildirim Kayıtları',[
      ['Kanal',channelNames[applied.channel]??'Tümü'],['Durum',statusNames[applied.status]??'Tümü'],['Arama',applied.q],['Yüklenen Kayıt',items.length],['Filtreye Uyan Kayıt',matchedCount],[],
      ['Oluşturulma','Kanal','Kayıt Türü','Durum','Alıcı','Başlık','Mesaj','Deneme Sayısı','Son Deneme','Kontrol Notu'],
      ...items.map(item=>[financeDateTime(item.created_at),channelNames[item.channel]??'Bildirim',modeLabel(item),stateLabel(item),item.recipient,item.subject??'',item.body,item.attempt_count,item.last_attempt_at?financeDateTime(item.last_attempt_at):'Henüz Denenmedi',item.failure_reason??''])
    ]);
  }
  return <main><AdminNav/><section className={styles.workspace}>
    <header className={styles.header}><h1>Bildirim Merkezi</h1><button type='button' className='secondary' disabled={blocked||historyLoading||configurationLoading} onClick={()=>void refresh()}>Kayıtları ve Kanalları Yenile</button></header>
    <p>Bildirim kaydını ve iletim durumunu buradan takip edin. E-posta durumları sağlayıcıya iletimi gösterir.</p>
    {accessError&&<div className='notice' role='alert'>{accessError}<button type='button' onClick={()=>void refreshPermissions()}>Yetkileri Yenile</button></div>}
    {message&&<p className='notice' role='status'>{message}</p>}
    {historyError&&<p className='notice' role='alert'>{historyError} Alınabilen son liste gösteriliyor; işlem yapmadan önce kayıtları yenileyin.</p>}
    {olderError&&<p className='notice' role='alert'>{olderError} Görünen kayıtlar korunuyor. Önceki Kayıtları Yükle düğmesiyle yeniden deneyebilirsiniz.</p>}
    {configurationError&&<p className='notice' role='alert'>{configurationError} Yeni bildirim için kanalları yeniden yükleyin.</p>}
    {submission.pending&&<section className='form-card'><h2>Bildirim Kaydını Kontrol Edin</h2><p>Önceki kaydın sonucu doğrulanamadı. Yeni bildirim girmeden asıl isteği kontrol edin. Sayfayı kapatırsanız önce kayıt geçmişini inceleyin.</p><button type='button' disabled={busy||submission.busy||accessLoading||!permissions.notificationCreate} onClick={()=>void saveRecord(true)}>Bildirimi Doğrula / Yeniden Dene</button></section>}
    <div className={styles.metrics}><article><p>Tüm Kayıtlar</p><h2>{historyReady?counts?.total??'—':'—'}</h2></article><article><p>İletim Bekleyen</p><h2>{historyReady?counts?.pending??'—':'—'}</h2></article><article><p>Başarısız</p><h2>{historyReady?counts?.failed??'—':'—'}</h2></article><article><p>Sonucu Belirsiz</p><h2>{historyReady?counts?.unknown??'—':'—'}</h2></article></div>
    <section className='form-card'><h2>Bildirim Kanalları</h2><p className={styles.note}>{configurationLoading?'Kanal bilgileri yükleniyor…':configurationReady?(configuration?.simulated?'Test olarak işaretlenen kayıtlarda gerçek SMS veya e-posta gönderilmez.':'Her kaydın iletim türü ve sonucu kendi kartında gösterilir.'):'Kanal bilgileri henüz doğrulanmadı.'}</p>{configurationReady&&<div className={styles.channelList}>{configuration?.channels.map(item=><article key={item.channel}><strong>{channelNames[item.channel]}</strong><span className={[styles.badge,item.available?styles.sent:''].join(' ')}>{item.available?'Bilgiler Hazır':'Bağlantı Bekleniyor'}</span><p className={styles.note}>{item.reason}</p></article>)}</div>}</section>
    {permissions.notificationCreate&&<form className='form-card' onSubmit={submit}><h2>Yeni Bildirim</h2><fieldset className={styles.fields} disabled={blocked||accessLoading||!configurationReady||!historyReady||historyLoading}>
      <div className={styles.formGrid}><label>Kanal<select value={form.channel} onChange={event=>changeChannel(event.target.value as Channel)}>{Object.entries(channelNames).map(([channel,name])=><option key={channel} value={channel} disabled={!configuration?.channels.find(item=>item.channel===channel)?.available}>{name}</option>)}</select></label>
      <label>Alıcı<input required type={form.channel==='EMAIL'?'email':'text'} maxLength={320} value={form.recipient} onChange={event=>setForm(current=>({...current,recipient:event.target.value}))}/></label>
      <label>Başlık<input maxLength={300} value={form.subject} onChange={event=>setForm(current=>({...current,subject:event.target.value}))}/></label>
      <label className={styles.wide}>Mesaj<textarea required maxLength={10000} value={form.body} onChange={event=>setForm(current=>({...current,body:event.target.value}))}/></label></div>
      <p className={styles.note}>{selectedChannel?.reason??'Hazır bir kanal seçin.'}</p><div className={styles.actions}><button disabled={blocked||!selectedChannel?.available}>{form.channel==='IN_APP'?'Uygulama İçinde Kaydet':configuration?.simulated?'Test Kaydı Oluştur':'Kaydet ve İletime Al'}</button></div>
    </fieldset></form>}
    <section className={styles.filters} aria-label='Bildirim Filtreleri'><label className={styles.search}>Alıcı, Başlık veya Mesaj Ara<input maxLength={200} disabled={blocked} value={filters.q} onChange={event=>setFilters(current=>({...current,q:event.target.value}))}/></label><label>Kanal<select disabled={blocked} value={filters.channel} onChange={event=>setFilters(current=>({...current,channel:event.target.value}))}><option value=''>Tüm Kanallar</option>{Object.entries(channelNames).map(([channel,name])=><option key={channel} value={channel}>{name}</option>)}</select></label><label>Durum<select disabled={blocked} value={filters.status} onChange={event=>setFilters(current=>({...current,status:event.target.value}))}><option value=''>Tüm Durumlar</option>{Object.entries(statusNames).map(([status,name])=><option key={status} value={status}>{name}</option>)}</select></label><button type='button' disabled={blocked||historyLoading} onClick={()=>void loadHistory(filters)}>Filtreyi Uygula</button><button type='button' className='secondary' disabled={blocked||historyLoading} onClick={()=>{setFilters({...emptyFilters});void loadHistory({...emptyFilters});}}>Filtreyi Temizle</button></section>
    {applied&&filtersChanged&&<p className='notice' role='status'>Listede önceki filtre sonuçları var. Yeni seçimi uygulamak için Filtreyi Uygula düğmesine basın.</p>}
    <div className={styles.footer}><p>{items.length} kayıt yüklendi{historyReady?' · Filtreye uyan '+matchedCount+' kayıt':''}. Özet kutuları tüm bildirimleri kapsar.</p><button type='button' className='secondary' disabled={!historyReady||historyLoading||loadingOlder||filtersChanged||blocked||!items.length} onClick={exportRecords}>Yüklenenleri Excel&apos;e Aktar</button></div>
    {historyLoading&&<p role='status'>Bildirimler yükleniyor…</p>}
    <div className={styles.cards}>{items.map(item=><article key={item.id} className={styles.card}><div className={styles.cardTop}><span className={[styles.badge,item.is_simulated?styles.simulation:''].join(' ')}>{channelNames[item.channel]} · {modeLabel(item)}</span><span className={[styles.badge,item.needs_review?styles.unknown:item.status==='FAILED'?styles.failed:item.status==='SENT'?styles.sent:''].join(' ')}>{stateLabel(item)}</span></div><h2>{item.subject||'Başlıksız Bildirim'}</h2><p className={styles.body}>{item.body}</p><div className={styles.meta}><p><strong>Alıcı:</strong> {item.recipient}</p><p><strong>Oluşturulma:</strong> {financeDateTime(item.created_at)}</p>{item.attempt_count>0&&<p><strong>İletim Denemesi:</strong> {item.attempt_count}</p>}{item.last_attempt_at&&<p><strong>Son Deneme:</strong> {financeDateTime(item.last_attempt_at)}</p>}</div>{item.failure_reason&&<p className={styles.reason}>{item.failure_reason}</p>}<div className={styles.actions}>{item.can_retry&&permissions.notificationRetry&&<button type='button' className='secondary' disabled={blocked||accessLoading||!historyReady||historyLoading} onClick={()=>void retryRecord(item.id)}>Yeniden Dene</button>}{item.needs_review&&<p className={styles.note}>İletim kaydı kontrol edilmeli.</p>}</div></article>)}</div>
    {!items.length&&!historyLoading&&<p className='empty-state'>{historyReady?'Bu filtreye uyan bildirim yok.':'Bildirimler alınamadı. Kayıtları yenileyin.'}</p>}
    {next&&<div className={styles.footer}><p>Önceki kayıtları yükleyerek geçmişi inceleyebilirsiniz.</p><button type='button' className='secondary' disabled={loadingOlder||blocked||!historyReady||historyLoading||filtersChanged} onClick={()=>void loadOlder()}>{loadingOlder?'Yükleniyor…':'Önceki Kayıtları Yükle'}</button></div>}
  </section></main>;
}
