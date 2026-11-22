'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AdminNav } from '../components/admin-nav';
import { api, ApiError } from '../lib/api';
import styles from './commissions.module.css';
import { createRequestGate } from '../lib/async-controls';
import { validateLegacyCommissionData } from '../lib/legacy-commission-data';

type Rule={id:string;product_id:string;recipient_user_id:string;recipient_kind:string;sales_channel_group:string|null;amount_per_unit:string;currency:string;is_active:boolean;product_name:string;sku:string;recipient_email:string|null};
type Entry={id:string;amount:string;currency:string;status:string;entry_kind:string;created_at:string;finalized_at:string|null;paid_at:string|null;reversed_at:string|null;note:string|null;order_number:string;product_name:string;quantity:number;recipient_email:string|null;recipient_kind:string};
type Option={id:string;name?:string;sku?:string;email?:string;role?:string;currency?:string;account_type?:string};
type Data={canManage:boolean;rules:Rule[];entries:Entry[];staff:Option[];products:Option[];accounts:Option[]};
const money=(value:string,currency:string)=>Number(value).toLocaleString('tr-TR',{style:'currency',currency});
const labels:Record<string,string>={PENDING:'Bekliyor',CONFIRMED:'Kesinleşti',PAID:'Ödendi',REVERSED:'Ters kayıt',STAFF:'Personel',MANAGER:'Yönetici',EARN:'Prim',REVERSAL:'Ters kayıt'};
export default function CommissionPage(){
 const [data,setData]=useState<Data|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState('');
 const actionLock=useRef(false),gate=useRef(createRequestGate()),alive=useRef(true);
 const confirmationRef=useRef<HTMLFormElement|null>(null);
 const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[loadError,setLoadError]=useState('');
 const [reverseId,setReverseId]=useState(''),[reversalNote,setReversalNote]=useState(''),[closeRuleId,setCloseRuleId]=useState('');
 const controlsDisabled=loading||!ready||Boolean(busy);
 const selectedReversal=data?.entries.find(row=>row.id===reverseId&&row.entry_kind==='EARN'&&['PENDING','CONFIRMED'].includes(row.status));
 const selectedRule=data?.rules.find(row=>row.id===closeRuleId&&row.is_active);
 const [form,setForm]=useState({productId:'',recipientUserId:'',recipientKind:'STAFF',salesChannelGroup:'RETAIL',amountPerUnit:''});
 const [productQuery,setProductQuery]=useState('');
 const filteredProducts=(data?.products??[]).filter(p=>{const query=productQuery.trim().toLocaleLowerCase('tr-TR');return !query||`${p.name??''} ${p.sku??''}`.toLocaleLowerCase('tr-TR').includes(query);}).slice(0,200);
 const selectedProduct=data?.products.find(row=>row.id===form.productId);
 const matchingProducts=selectedProduct&&!filteredProducts.some(row=>row.id===selectedProduct.id)?[selectedProduct,...filteredProducts]:filteredProducts;
 const [startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState('');
 const invalidRange=Boolean(startDate&&endDate&&startDate>endDate);
 const visibleEntries=(data?.entries??[]).filter(entry=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(entry.created_at));const day=['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value).join('-');return !invalidRange&&(!startDate||day>=startDate)&&(!endDate||day<=endDate);});
 const [accounts,setAccounts]=useState<Record<string,string>>({});
 async function load(){
  const ticket=gate.current.begin();setLoading(true);setReady(false);setLoadError('');
  try{
   const next=validateLegacyCommissionData<Data>(await api<unknown>('/admin/commissions'));
   if(!alive.current||!gate.current.isCurrent(ticket))return false;
   setData(next);setReady(true);return true;
  }catch(error){
   if(alive.current&&gate.current.isCurrent(ticket)){setData(null);setLoadError(error instanceof Error?error.message:'Prim Kayıtları Alınamadı.');}
   return false;
  }finally{if(alive.current&&gate.current.isCurrent(ticket))setLoading(false);}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;gate.current.invalidate();};},[]);
 useEffect(()=>{if(reverseId||closeRuleId)confirmationRef.current?.scrollIntoView({behavior:'smooth',block:'center'});},[reverseId,closeRuleId]);
 async function perform(path:string,method:string,body:unknown,ok:string,afterSave?:()=>void){
  if(actionLock.current||controlsDisabled||!data?.canManage)return;
  actionLock.current=true;setBusy(path);setMessage('');
  try{
   await api(path,{method,body:body===undefined?undefined:JSON.stringify(body)});
   if(!alive.current)return;
   afterSave?.();setMessage(ok);
   const refreshed=await load();
   if(alive.current&&!refreshed)setMessage(ok+' Güncel liste alınamadı; yeni işlemden önce Yenile düğmesini kullanın.');
  }catch(error){
   if(!alive.current)return;
   const uncertain=!(error instanceof ApiError)||error.status>=500;
   setMessage((uncertain?'İşlemin sonucu doğrulanamadı; güncel kayıtları kontrol edin. ':'')+(error instanceof Error?error.message:'İşlem tamamlanamadı.'));
   // Re-read the state once; never automatically repeat a financial write.
   await load();
  }finally{actionLock.current=false;if(alive.current)setBusy('');}
 }
 async function create(event:FormEvent){
  event.preventDefault();
  if(!data?.products.some(row=>row.id===form.productId)||!data.staff.some(row=>row.id===form.recipientUserId))return;
  const amount=Number(form.amountPerUnit);
  if(!form.amountPerUnit.trim()||!Number.isFinite(amount)||amount<0||amount>9999999999.99)return;
  await perform('/admin/commissions/staff-rules','POST',{...form,amountPerUnit:amount},'Prim kuralı kaydedildi. Önceki prim kayıtları korunur.',()=>setForm(current=>({...current,amountPerUnit:''})));
 }
 async function act(id:string,action:'finalize'|'pay'){
  const entry=data?.entries.find(row=>row.id===id&&row.entry_kind==='EARN'&&row.status===(action==='pay'?'CONFIRMED':'PENDING'));
  if(!entry)return;
  const account=action==='pay'?data?.accounts.find(row=>row.id===accounts[id]&&row.currency===entry.currency):null;
  if(action==='pay'&&!account)return;
  await perform(`/admin/commissions/entries/${id}/${action}`,'POST',account?{accountId:account.id}:undefined,action==='pay'?'Prim ödemesi finansa kaydedildi.':'Prim kesinleştirildi.');
 }
 async function reverse(event:FormEvent){
  event.preventDefault();if(!selectedReversal||!reversalNote.trim())return;
  await perform(`/admin/commissions/entries/${selectedReversal.id}/reverse`,'POST',{note:reversalNote.trim()},'Seçilen prim için ters kayıt oluşturuldu.',()=>{setReverseId('');setReversalNote('');});
 }
 async function closeRule(event:FormEvent){
  event.preventDefault();if(!selectedRule)return;
  await perform(`/admin/commissions/rules/${selectedRule.id}`,'DELETE',undefined,'Prim kuralı kapatıldı. Önceki hakedişler korunur.',()=>setCloseRuleId(''));
 }
 return <main><AdminNav/><section className={styles.page}><p>FİNANS / PRİM MOTORU</p><h1>Personel Prim Kuralları Ve Hareketleri</h1><nav className="finance-nav"><Link href="/primler/yonetim">Yönetici Ve Müdür Primleri</Link><Link href="/primler/bayi">Bayi Prim Talepleri Ve Ödemeler</Link></nav><p>Ürün, satış kanalı ve alıcı için sabit TL/adet kuralı tanımlanır. Perakende grubu; site, pazaryeri, Instagram ve yönetimden girilen perakende siparişlerini kapsar.</p>{message&&<p role="status">{message}</p>}{loadError&&<p role="alert">{loadError}</p>}
 <div className="button-row"><button type="button" disabled={loading||Boolean(busy)} onClick={()=>void load()}>{loading?'Primler Yükleniyor…':'Yenile'}</button><span>{ready?'Güncel kayıtlar doğrulandı.':'Kayıtlar henüz doğrulanmadı.'}</span></div>
 {data?.canManage&&<p>Bu ekran banka havalesi göndermez. Ödemeyi yaptıktan sonra aynı para birimindeki hesabı seçip Ödendi Kaydet düğmesini kullanın.</p>}
 {selectedReversal&&data?.canManage&&<form ref={confirmationRef} aria-labelledby="reverse-commission-title" className={styles.confirmation} onSubmit={reverse}><h2 id="reverse-commission-title">Seçilen Prim İçin Ters Kayıt</h2><p><b>{selectedReversal.order_number}</b> · {selectedReversal.product_name} · {selectedReversal.recipient_email} · {money(selectedReversal.amount,selectedReversal.currency)}</p><p>Bu işlem yalnızca seçilen hakedişi etkiler. İşlem geçmişi korunur.</p><label>Açıklama<textarea autoFocus required maxLength={500} disabled={controlsDisabled} value={reversalNote} onChange={event=>setReversalNote(event.target.value)}/></label><div className="button-row"><button disabled={controlsDisabled||!reversalNote.trim()}>Seçilen Prime Ters Kayıt Oluştur</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={()=>{setReverseId('');setReversalNote('');}}>Vazgeç</button></div></form>}
 {selectedRule&&data?.canManage&&<form ref={confirmationRef} aria-labelledby="close-commission-rule-title" className={styles.confirmation} onSubmit={closeRule}><h2 id="close-commission-rule-title">Prim Kuralını Kapat</h2><p>{selectedRule.product_name} · {selectedRule.recipient_email} · {money(selectedRule.amount_per_unit,selectedRule.currency)} / adet</p><p>Önceki hakedişler korunur; bu kural yeni hakedişlerde kullanılmaz.</p><div className="button-row"><button disabled={controlsDisabled}>Kuralı Kapatmayı Onayla</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={()=>setCloseRuleId('')}>Vazgeç</button></div></form>}
 {data?.canManage&&<form className="form-card" onSubmit={create}><h2>Ürün Bazında Personel Primi</h2><fieldset disabled={controlsDisabled}><div className="form-grid"><label>Ürün Ara<input value={productQuery} onChange={e=>setProductQuery(e.target.value)} placeholder="Ürün adı veya SKU yazın" /></label><label>Ürün<select required value={form.productId} onChange={e=>setForm(x=>({...x,productId:e.target.value}))}><option value="">Seçin</option>{matchingProducts.map(p=><option key={p.id} value={p.id}>{p.name} {p.sku?`(${p.sku})`:''}</option>)}</select></label><label>Satış kanalı<select value={form.salesChannelGroup} onChange={e=>setForm(x=>({...x,salesChannelGroup:e.target.value}))}><option value="RETAIL">Perakende (site / pazaryeri / Instagram)</option><option value="WHOLESALE">Toptan</option><option value="DEALER">Bayi</option></select></label><label>Prim alıcısı<select required value={form.recipientUserId} onChange={e=>setForm(x=>({...x,recipientUserId:e.target.value}))}><option value="">Seçin</option>{data?.staff.map(s=><option key={s.id} value={s.id}>{s.email} · {s.role}</option>)}</select></label><label>Prim tipi<select value={form.recipientKind} onChange={e=>setForm(x=>({...x,recipientKind:e.target.value}))}><option value="STAFF">Personel</option><option value="MANAGER">Yönetici</option></select></label><label>Adet başına prim (TL)<input required type="number" min="0" max="9999999999.99" step="0.01" value={form.amountPerUnit} onChange={e=>setForm(x=>({...x,amountPerUnit:e.target.value}))}/></label></div><button disabled={controlsDisabled}>{busy==='/admin/commissions/staff-rules'?'Kaydediliyor…':'Kuralı Kaydet'}</button></fieldset></form>}
 <h2>Aktif Prim Kuralları</h2><div style={{overflowX:'auto'}}><table><thead><tr><th>Ürün</th><th>Satış kanalı</th><th>Alıcı</th><th>Tip</th><th>Adet primi</th><th></th></tr></thead><tbody>{data?.rules.filter(r=>r.is_active).map(r=><tr key={r.id}><td>{r.product_name}<br/><small>{r.sku}</small></td><td>{r.sales_channel_group==='RETAIL'?'Perakende':r.sales_channel_group==='WHOLESALE'?'Toptan':r.sales_channel_group==='DEALER'?'Bayi':'Tüm kanallar'}</td><td>{r.recipient_email}</td><td>{labels[r.recipient_kind]??r.recipient_kind}</td><td>{money(r.amount_per_unit,r.currency)}</td><td>{data?.canManage&&<button className="secondary" disabled={controlsDisabled} onClick={()=>{setCloseRuleId(r.id);setReverseId('');}}>Kuralı kapat</button>}</td></tr>)}</tbody></table></div>{ready&&data&&!data.rules.some(r=>r.is_active)&&<p>Henüz aktif prim kuralı yok.</p>}
 <h2>Prim Hareketleri</h2><div className={styles.filters}><label>Başlangıç Tarihi<input type="date" value={startDate} onChange={event=>setStartDate(event.target.value)}/></label><label>Bitiş Tarihi<input type="date" value={endDate} onChange={event=>setEndDate(event.target.value)}/></label><button type="button" className="secondary" onClick={()=>{setStartDate('');setEndDate('')}}>Tarihleri Temizle</button><span>{ready?visibleEntries.length:'—'} Prim Hareketi</span></div>{invalidRange&&<p role="alert">Bitiş Tarihi Başlangıç Tarihinden Önce Olamaz.</p>}<div style={{overflowX:'auto'}}><table><thead><tr><th>Sipariş / ürün</th><th>Alıcı</th><th>Tutar</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{visibleEntries.map(e=>{const account=accounts[e.id]||'';return <tr key={e.id}><td><strong>{e.order_number}</strong><br/>{e.product_name} · {e.quantity} adet</td><td>{e.recipient_email}<br/><small>{labels[e.recipient_kind]??e.recipient_kind}</small></td><td>{money(e.amount,e.currency)}</td><td>{labels[e.status]??e.status}<br/><small>{new Date(e.created_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</small></td><td>{data?.canManage&&e.entry_kind==='EARN'&&e.status==='PENDING'&&<button disabled={controlsDisabled} onClick={()=>void act(e.id,'finalize')}>Kesinleştir</button>}{data?.canManage&&e.entry_kind==='EARN'&&e.status==='CONFIRMED'&&<span className="button-row"><select disabled={controlsDisabled} aria-label="Ödeme hesabı" value={account} onChange={x=>setAccounts(a=>({...a,[e.id]:x.target.value}))}><option value="">Kasa seçin</option>{data?.accounts.filter(a=>a.currency===e.currency).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><button disabled={controlsDisabled||!data?.accounts.some(row=>row.id===account&&row.currency===e.currency)} onClick={()=>void act(e.id,'pay')}>Ödendi Kaydet</button></span>}{data?.canManage&&e.entry_kind==='EARN'&&['PENDING','CONFIRMED'].includes(e.status)&&<button className="secondary" disabled={controlsDisabled} onClick={()=>{setReverseId(e.id);setReversalNote('');setCloseRuleId('');}}>Ters kayıt</button>}{e.entry_kind==='REVERSAL'&&<small>{e.note}</small>}</td></tr>})}</tbody></table></div>{ready&&data&&!visibleEntries.length&&<p>Seçilen Dönemde Gösterilecek Prim Hareketi Yok.</p>}{!data&&!ready&&<p role="status">{loading?'Prim kayıtları yükleniyor…':'Prim kayıtları doğrulanmadı. Yenile düğmesini kullanın.'}</p>}</section></main>;
}
