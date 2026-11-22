'use client';
import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { useOrderPermissions } from '../lib/use-order-permissions';
import { useFinanceSubmission } from '../lib/use-finance-submission';
import { createActionLock, createRequestGate } from '../lib/async-controls';
import { financeDateTime } from '../lib/finance-report';
import styles from './workspace.module.css';

type Campaign={id:string;name:string;status:'DRAFT'|'ACTIVE'|'PAUSED'|'ARCHIVED';starts_at:string|null;ends_at:string|null;coupon_count:number};
type Coupon={id:string;campaign_id:string;campaign_name:string;campaign_status:string;code:string;discount_type:'FIXED_TRY'|'PERCENT';discount_value:string;usage_limit:number|null;used_count:number;starts_at:string|null;ends_at:string|null};
const emptyCampaign=()=>({name:'',startsAt:'',endsAt:''});
const emptyCoupon=()=>({campaignId:'',code:'',discountType:'PERCENT',discountValue:'',usageLimit:'',startsAt:'',endsAt:''});
const statusNames:Record<string,string>={DRAFT:'Taslak',ACTIVE:'Etkin',PAUSED:'Duraklatıldı',ARCHIVED:'Arşivlendi'};
const date=(value:string|null)=>value?financeDateTime(value):'Sınır Yok';
function businessTime(value:string){
  if(!value)return undefined;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))throw new Error('Geçerli bir tarih ve saat seçin.');
  const calendar=new Date(value.slice(0,10)+'T00:00:00Z'),parsed=new Date(value+'+03:00');
  if(Number.isNaN(parsed.getTime())||Number.isNaN(calendar.getTime())||calendar.toISOString().slice(0,10)!==value.slice(0,10)||Number(value.slice(11,13))>23)throw new Error('Geçerli bir tarih ve saat seçin.');
  return parsed.toISOString();
}
function timeWindow(startsAt:string,endsAt:string){const start=businessTime(startsAt),end=businessTime(endsAt);if(start&&end&&end<=start)throw new Error('Bitiş tarihi başlangıçtan sonra olmalı.');return {startsAt:start,endsAt:end};}

export function CampaignsWorkspace(){
  const params=useSearchParams(),requestedTab=params.get('tab'),tab=requestedTab==='coupons'?'coupons':requestedTab==='discounts'?'discounts':'campaigns';
  const {permissions,loading:accessLoading,error:accessError,refresh:refreshPermissions}=useOrderPermissions();
  const [campaigns,setCampaigns]=useState<Campaign[]>([]),[coupons,setCoupons]=useState<Coupon[]>([]);
  const [campaignReady,setCampaignReady]=useState(false),[couponReady,setCouponReady]=useState(false),[campaignLoading,setCampaignLoading]=useState(true),[couponLoading,setCouponLoading]=useState(true);
  const [campaignError,setCampaignError]=useState(''),[couponError,setCouponError]=useState(''),[message,setMessage]=useState('');
  const [campaign,setCampaign]=useState(emptyCampaign),[coupon,setCoupon]=useState(emptyCoupon),[editor,setEditor]=useState<'campaign'|'coupon'|null>(null);
  const [busy,setBusy]=useState(false),[query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState('');
  const campaignSubmission=useFinanceSubmission('/admin/campaigns/idempotent','id','Kampanya');
  const couponSubmission=useFinanceSubmission('/admin/campaigns/'+coupon.campaignId+'/coupons/idempotent','id','Hediye Çeki');
  const alive=useRef(true),campaignGate=useRef(createRequestGate()),couponGate=useRef(createRequestGate()),actionLock=useRef(createActionLock()),campaignReadyRef=useRef(false),couponReadyRef=useRef(false);
  const pending=Boolean(campaignSubmission.pending||couponSubmission.pending),blocked=busy||campaignSubmission.busy||couponSubmission.busy||pending;
  const shownCampaigns=campaigns.filter(item=>(!statusFilter||item.status===statusFilter)&&(!query.trim()||item.name.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR'))));
  const shownCoupons=coupons.filter(item=>(!statusFilter||item.campaign_status===statusFilter)&&(!query.trim()||(item.code+' '+item.campaign_name).toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR'))));
  async function loadCampaigns(){
    const ticket=campaignGate.current.begin();campaignReadyRef.current=false;setCampaignReady(false);setCampaignLoading(true);setCampaignError('');
    try{const result=await api<Campaign[]>('/admin/campaigns');if(!alive.current||!campaignGate.current.isCurrent(ticket))return;
      if(!Array.isArray(result)||result.some(item=>!item.id||!statusNames[item.status]||!Number.isInteger(item.coupon_count)))throw new Error('Kampanya listesi doğrulanamadı.');
      setCampaigns(result);campaignReadyRef.current=true;setCampaignReady(true);
    }catch(error){if(alive.current&&campaignGate.current.isCurrent(ticket))setCampaignError(error instanceof Error?error.message:'Kampanyalar yüklenemedi.');}
    finally{if(alive.current&&campaignGate.current.isCurrent(ticket))setCampaignLoading(false);}
  }
  async function loadCoupons(){
    const ticket=couponGate.current.begin();couponReadyRef.current=false;setCouponReady(false);setCouponLoading(true);setCouponError('');
    try{const result=await api<Coupon[]>('/admin/campaigns/coupons');if(!alive.current||!couponGate.current.isCurrent(ticket))return;
      if(!Array.isArray(result)||result.some(item=>!item.id||!statusNames[item.campaign_status]||!Number.isInteger(item.used_count)||!Number.isFinite(Number(item.discount_value))))throw new Error('Hediye çeki listesi doğrulanamadı.');
      setCoupons(result);couponReadyRef.current=true;setCouponReady(true);
    }catch(error){if(alive.current&&couponGate.current.isCurrent(ticket))setCouponError(error instanceof Error?error.message:'Hediye çekleri yüklenemedi.');}
    finally{if(alive.current&&couponGate.current.isCurrent(ticket))setCouponLoading(false);}
  }
  async function load(afterWrite=false){if(actionLock.current.isLocked()&&!afterWrite)return;await Promise.all([loadCampaigns(),loadCoupons()]);}
  function stopReads(){campaignGate.current.invalidate();couponGate.current.invalidate();setCampaignLoading(false);setCouponLoading(false);}
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;campaignReadyRef.current=false;couponReadyRef.current=false;campaignGate.current.invalidate();couponGate.current.invalidate();};},[]);
  useEffect(()=>{if(!blocked)setEditor(null);},[tab]);
  async function save(kind:'campaign'|'coupon',retry=false){
    if(!alive.current||accessLoading||!permissions.campaignCreate||actionLock.current.isLocked())return;
    const submission=kind==='campaign'?campaignSubmission:couponSubmission;
    if(retry&&!submission.pending)return;
    if(!retry&&(pending||!campaignReadyRef.current||kind==='coupon'&&!couponReadyRef.current))return;
    let body='';
    try{if(!retry){
      if(kind==='campaign'){if(!campaign.name.trim())throw new Error('Kampanya adını girin.');body=JSON.stringify({name:campaign.name.trim(),...timeWindow(campaign.startsAt,campaign.endsAt)});}
      else{
        if(!campaigns.some(item=>item.id===coupon.campaignId&&item.status!=='ARCHIVED'))throw new Error('Güncel listeden bir kampanya seçin.');
        const code=coupon.code.trim().toUpperCase(),value=Number(coupon.discountValue),limit=coupon.usageLimit?Number(coupon.usageLimit):undefined;
        if(!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code))throw new Error('Çek kodunda A–Z, rakam, tire veya alt çizgi kullanın.');
        if(!Number.isInteger(value)||value<1||value>1_000_000||coupon.discountType==='PERCENT'&&value>100)throw new Error('Geçerli bir indirim değeri girin.');
        if(limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>2_147_483_647))throw new Error('Geçerli bir kullanım limiti girin.');
        body=JSON.stringify({code,discountType:coupon.discountType,discountValue:value,usageLimit:limit,...timeWindow(coupon.startsAt,coupon.endsAt)});
      }
    }}catch(error){setMessage(error instanceof Error?error.message:'Alanları kontrol edin.');return;}
    if(!actionLock.current.acquire())return;stopReads();setBusy(true);setMessage('');
    try{const result=retry?await submission.retry():await submission.send(body);if(!alive.current)return;
      if(kind==='campaign')setCampaign(emptyCampaign());else setCoupon(current=>({...emptyCoupon(),campaignId:current.campaignId}));setEditor(null);
      setMessage(result.replayed?'Önceki kayıt doğrulandı. Yeni kayıt oluşturulmadı.':kind==='campaign'?'Kampanya taslak olarak kaydedildi. Etkinleştirme ayrı bir onay işlemidir.':'Hediye çeki kaydedildi. Kullanılabilmesi için kampanyası etkin ve tarih aralığı uygun olmalı.');await load(true);
    }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'Kayıt sonucu doğrulanamadı.');}
    finally{actionLock.current.release();if(alive.current)setBusy(false);}
  }
  async function changeStatus(item:Campaign){
    if(!alive.current||accessLoading||!permissions.campaignApprove||pending||!campaignReadyRef.current||actionLock.current.isLocked()||item.status==='ARCHIVED')return;
    const current=campaigns.find(row=>row.id===item.id);if(!current||current.status!==item.status)return;if(!actionLock.current.acquire())return;
    const target=item.status==='ACTIVE'?'PAUSED':'ACTIVE';stopReads();setBusy(true);setMessage('');
    try{const result=await api<{id:string;status:string}>('/admin/campaigns/'+item.id+'/'+(target==='ACTIVE'?'activate':'pause'),{method:'POST',body:JSON.stringify({expectedStatus:item.status})});if(!alive.current)return;
      if(result?.id!==item.id||result.status!==target)throw new Error('Kampanya durumu doğrulanamadı.');
      setMessage(target==='ACTIVE'?'Kampanya etkinleştirildi. Geçerlilik tarihleri ayrıca uygulanır.':'Kampanya duraklatıldı.');await load(true);
    }catch(error){if(alive.current){campaignReadyRef.current=false;setCampaignReady(false);setMessage((error instanceof Error?error.message:'Kampanya durumu doğrulanamadı.')+' Yeni işlemden önce kayıtları yenileyin.');}}
    finally{actionLock.current.release();if(alive.current)setBusy(false);}
  }
  function openEditor(kind:'campaign'|'coupon'){if(blocked||!permissions.campaignCreate)return;setEditor(current=>current===kind?null:kind);setMessage('');}
  function submit(event:FormEvent,kind:'campaign'|'coupon'){event.preventDefault();void save(kind);}
  return <main><AdminNav/><section className={styles.workspace}>
    <header className={styles.header}><div><p>KAMPANYA VE FİYATLANDIRMA</p><h1>{tab==='coupons'?'Hediye Çekleri':tab==='discounts'?'Hızlı İndirimler':'Kampanyalar'}</h1></div><div className={styles.actions}><button type='button' className='secondary' disabled={blocked||campaignLoading||couponLoading} onClick={()=>void load()}>Kayıtları Yenile</button>{permissions.campaignCreate&&<button type='button' disabled={blocked||accessLoading} onClick={()=>openEditor(tab==='coupons'?'coupon':'campaign')}>{tab==='coupons'?'+ Yeni Hediye Çeki':'+ Yeni Kampanya'}</button>}</div></header>
    <p>Taslak kampanya hazırlayın, hediye çeklerini bağlayın ve yetkiniz varsa etkinleştirin. Tarih ve saatler Türkiye saatine göre uygulanır.</p>
    {accessError&&<div className='notice' role='alert'>{accessError}<button type='button' onClick={()=>void refreshPermissions()}>Yetkileri Yenile</button></div>}
    {message&&<p className='notice' role='status'>{message}</p>}
    {campaignError&&<p className='notice' role='alert'>{campaignError} Son alınan kampanyalar korunuyor; işlem yapmadan önce yenileyin.</p>}
    {couponError&&<p className='notice' role='alert'>{couponError} Son alınan çekler korunuyor.</p>}
    {(campaignSubmission.pending||couponSubmission.pending)&&<section className='form-card'><h2>Önceki Kaydı Doğrulayın</h2><p>Önceki kaydın sonucu doğrulanamadı. Asıl isteği doğrulayın; sayfayı kapattıysanız önce mevcut kayıtları inceleyin.</p>{campaignSubmission.pending&&<button type='button' disabled={busy||campaignSubmission.busy||accessLoading||!permissions.campaignCreate} onClick={()=>void save('campaign',true)}>Kampanyayı Doğrula / Yeniden Dene</button>}{couponSubmission.pending&&<button type='button' disabled={busy||couponSubmission.busy||accessLoading||!permissions.campaignCreate} onClick={()=>void save('coupon',true)}>Hediye Çekini Doğrula / Yeniden Dene</button>}</section>}
    <div className={styles.metrics}><article><p>Toplam Kampanya</p><h2>{campaignReady?campaigns.length:'—'}</h2></article><article><p>Etkin Kampanya</p><h2>{campaignReady?campaigns.filter(item=>item.status==='ACTIVE').length:'—'}</h2></article><article><p>Hediye Çeki</p><h2>{couponReady?coupons.length:'—'}</h2></article><article><p>Kullanılan Çek</p><h2>{couponReady?coupons.reduce((sum,item)=>sum+item.used_count,0):'—'}</h2></article></div>
    {editor&&permissions.campaignCreate&&<form className='form-card' onSubmit={event=>submit(event,editor)}><h2>{editor==='campaign'?'Yeni Kampanya':'Yeni Hediye Çeki'}</h2><fieldset className={styles.fields} disabled={blocked||accessLoading||!campaignReady||editor==='coupon'&&!couponReady}><div className={styles.formGrid}>
      {editor==='campaign'?<label className={styles.wide}>Kampanya Adı<input required maxLength={160} value={campaign.name} onChange={event=>setCampaign(current=>({...current,name:event.target.value}))}/></label>:<>
      <label>Kampanya<select required value={coupon.campaignId} onChange={event=>setCoupon(current=>({...current,campaignId:event.target.value}))}><option value=''>Kampanya Seçin</option>{campaigns.filter(item=>item.status!=='ARCHIVED').map(item=><option key={item.id} value={item.id}>{item.name} · {statusNames[item.status]}</option>)}</select></label>
      <label>Çek Kodu<input required maxLength={64} value={coupon.code} placeholder='TREX10' onChange={event=>setCoupon(current=>({...current,code:event.target.value.toUpperCase()}))}/></label>
      <label>İndirim Türü<select value={coupon.discountType} onChange={event=>setCoupon(current=>({...current,discountType:event.target.value}))}><option value='PERCENT'>Yüzde</option><option value='FIXED_TRY'>Sabit TL</option></select></label>
      <label>İndirim Değeri<input required min='1' step='1' max={coupon.discountType==='PERCENT'?100:1_000_000} type='number' value={coupon.discountValue} onChange={event=>setCoupon(current=>({...current,discountValue:event.target.value}))}/></label>
      <label>Kullanım Limiti<input type='number' min='1' step='1' max={2_147_483_647} value={coupon.usageLimit} placeholder='Boş bırakılırsa sınırsız' onChange={event=>setCoupon(current=>({...current,usageLimit:event.target.value}))}/></label></>}
      <label>Başlangıç · Türkiye Saati<input type='datetime-local' value={editor==='campaign'?campaign.startsAt:coupon.startsAt} onChange={event=>editor==='campaign'?setCampaign(current=>({...current,startsAt:event.target.value})):setCoupon(current=>({...current,startsAt:event.target.value}))}/></label>
      <label>Bitiş · Türkiye Saati<input type='datetime-local' value={editor==='campaign'?campaign.endsAt:coupon.endsAt} onChange={event=>editor==='campaign'?setCampaign(current=>({...current,endsAt:event.target.value})):setCoupon(current=>({...current,endsAt:event.target.value}))}/></label>
    </div><p className={styles.note}>Boş bırakılan tarihte sınır uygulanmaz. Hediye çekinde hem kampanya hem çek tarihleri geçerlidir.</p><div className={styles.actions}><button>{editor==='campaign'?'Taslağı Kaydet':'Hediye Çekini Kaydet'}</button><button type='button' className='secondary' onClick={()=>setEditor(null)}>Vazgeç</button></div></fieldset></form>}
    <div className={styles.filters}><label>Ad veya Çek Kodu Ara<input value={query} onChange={event=>setQuery(event.target.value)}/></label><label>Kampanya Durumu<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value=''>Tüm Durumlar</option>{Object.entries(statusNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
    {tab==='discounts'&&<section className='form-card'><h2>Ürün Fiyatını Değiştirmeden İndirim</h2><p>Bir kampanya altında yüzde veya sabit TL tutarında hediye çeki tanımlayın. Aşağıda mevcut kampanyalar yer alır.</p></section>}
    {tab==='coupons'?<section className={styles.tableSection} aria-label='Hediye Çeki Listesi'><header><h2>Hediye Çekleri</h2><span>{shownCoupons.length} kayıt</span></header><div className={styles.tableWrap}><table><thead><tr><th>Kod ve Kampanya</th><th>İndirim</th><th>Kullanım</th><th>Geçerlilik</th><th>Kampanya Durumu</th></tr></thead><tbody>{shownCoupons.map(item=><tr key={item.id}><td><strong>{item.code}</strong><small>{item.campaign_name}</small></td><td>{item.discount_type==='PERCENT'?'%'+Number(item.discount_value).toLocaleString('tr-TR'):Number(item.discount_value).toLocaleString('tr-TR',{style:'currency',currency:'TRY'})}</td><td>{item.used_count} / {item.usage_limit??'Sınırsız'}</td><td>{date(item.starts_at)}<small>{date(item.ends_at)}</small></td><td><span className={styles.badge}>{statusNames[item.campaign_status]??'Kontrol Bekliyor'}</span></td></tr>)}</tbody></table></div>{!shownCoupons.length&&<p className={styles.empty}>{couponLoading?'Hediye çekleri yükleniyor…':couponReady?'Bu filtreye uyan hediye çeki yok.':'Hediye çekleri alınamadı. Kayıtları yenileyin.'}</p>}</section>:<section className={styles.tableSection} aria-label='Kampanya Listesi'><header><h2>Kampanyalar</h2><span>{shownCampaigns.length} kayıt</span></header><div className={styles.tableWrap}><table><thead><tr><th>Kampanya</th><th>Başlangıç</th><th>Bitiş</th><th>Çek Sayısı</th><th>Durum</th>{permissions.campaignApprove&&<th>İşlem</th>}</tr></thead><tbody>{shownCampaigns.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{date(item.starts_at)}</td><td>{date(item.ends_at)}</td><td>{item.coupon_count}</td><td><span className={[styles.badge,item.status==='ACTIVE'?styles.active:''].join(' ')}>{statusNames[item.status]}</span></td>{permissions.campaignApprove&&<td>{item.status!=='ARCHIVED'&&<button type='button' className='secondary' disabled={blocked||accessLoading||!campaignReady||campaignLoading} onClick={()=>void changeStatus(item)}>{item.status==='ACTIVE'?'Duraklat':'Etkinleştir'}</button>}</td>}</tr>)}</tbody></table></div>{!shownCampaigns.length&&<p className={styles.empty}>{campaignLoading?'Kampanyalar yükleniyor…':campaignReady?'Bu filtreye uyan kampanya yok.':'Kampanyalar alınamadı. Kayıtları yenileyin.'}</p>}</section>}
  </section></main>;
}
export default function Campaigns(){return <Suspense fallback={<main><AdminNav/><p>Kampanyalar yükleniyor…</p></main>}><CampaignsWorkspace/></Suspense>;}
