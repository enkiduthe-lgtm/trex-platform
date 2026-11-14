'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { createRequestGate } from '../../lib/async-controls';
type Row={id:string;company_name:string;dealer_code:string;amount:string;currency:string;status:string;due_date:string;scheduled_date?:string;payment_allowed?:boolean;account_holder:string;iban:string;created_at:string;paid_at:string|null;reference_number:string|null;note:string|null};
type Account={id:string;name:string;currency:string};
type Return={id:string;order_number:string;currency:string;dealer_name:string;requested_at:string};
const statuses:Record<string,string>={REQUESTED:'Talep Edildi',APPROVED:'Onaylı · Havale Bekliyor',PAID:'Bankaya Yatırıldı',REJECTED:'Reddedildi',CANCELLED:'İptal Edildi'};
const money=(amount:string,currency:string)=>Number(amount).toLocaleString('tr-TR',{style:'currency',currency});
export default function DealerPayouts(){
 const [rows,setRows]=useState<Row[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[returns,setReturns]=useState<Return[]>([]),[role,setRole]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [selectedAccounts,setSelectedAccounts]=useState<Record<string,string>>({}),[references,setReferences]=useState<Record<string,string>>({}),[notes,setNotes]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState('OPEN'),[dueMonth,setDueMonth]=useState('');
 const [fee,setFee]=useState({returnId:'',amount:'',note:''});
 const actionLock=useRef(false);
 const loadGate=useRef(createRequestGate());
 const [loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false);
 const [canApprove,setCanApprove]=useState(false),[canRecordFee,setCanRecordFee]=useState(false);
 const selectedReturn=returns.find(row=>row.id===fee.returnId);
 async function load(){
  const ticket=loadGate.current.begin();
  setLoading(true);
  setLoaded(false);
  try {
   const {user}=await api<{user:{role:string}}>('/auth/me');
   const profile=user.role==='ADMIN' ? await api<{configured:boolean;grants:string[]|null}>('/admin/access/me') : undefined;
   const allowed=(action:string)=>user.role!=='ADMIN'||!profile?.configured||
     Boolean(profile.grants?.includes('COMMISSIONS.VIEW')&&profile.grants.includes(`COMMISSIONS.${action}`));
   const approve=allowed('APPROVE');
   const recordFee=allowed('CREATE');
   const [list,bank,received]=await Promise.allSettled([
    api<Row[]>('/admin/dealer-payouts'),
    approve ? api<Account[]>('/admin/dealer-payouts/payment-accounts') : Promise.resolve([]),
    recordFee ? api<Return[]>('/admin/dealer-payouts/return-fee') : Promise.resolve([]),
   ]);
   if(!loadGate.current.isCurrent(ticket))return;
   setRows(list.status==='fulfilled'?list.value:[]);
   setAccounts(bank.status==='fulfilled'?bank.value:[]);
   setReturns(received.status==='fulfilled'?received.value:[]);
   setRole(user.role);
   setCanApprove(approve);
   setCanRecordFee(recordFee);
   setLoaded(list.status==='fulfilled');
   const unavailable=[list,bank,received].flatMap((result,index)=>result.status==='rejected'?[['prim talepleri','ödeme hesapları','iade kayıtları'][index]]:[]);
   if(unavailable.length)throw new Error(`Yüklenemeyen bilgiler: ${unavailable.join(', ')}.`);
  } finally {
   if(loadGate.current.isCurrent(ticket))setLoading(false);
  }
 }
 useEffect(()=>{
  const gate=loadGate.current;
  void load().catch(e=>setMessage(e instanceof Error?e.message:'Talepler Yüklenemedi.'));
  return ()=>gate.invalidate();
 },[]);
 async function act(path:string,body:unknown,afterSave?:()=>void){
  if(actionLock.current||loading||!loaded)return;
  actionLock.current=true;setBusy(true);setMessage('');
  let saved=false;
  try{
   await api(path,{method:'POST',body:JSON.stringify(body)});
   saved=true;afterSave?.();await load();setMessage('İşlem Kaydedildi.');
  }catch(e){setMessage([saved?'İşlem kaydedildi.':'',e instanceof Error?e.message:'İşlem tamamlanamadı.'].filter(Boolean).join(' '));}
  finally{actionLock.current=false;setBusy(false);}
 }
 function recordFee(event:FormEvent){
  event.preventDefault();
  if(!selectedReturn||!canRecordFee)return;
  void act('/admin/dealer-payouts/return-fee',{returnId:fee.returnId,amount:Number(fee.amount),note:fee.note},()=>{
   setFee({returnId:'',amount:'',note:''});
   setReturns(current=>current.filter(row=>row.id!==fee.returnId));
  });
 }
 const shown=(loaded ? rows : []).filter(row=>(filter==='ALL'||(filter==='OPEN'?['REQUESTED','APPROVED'].includes(row.status):row.status===filter))&&(!dueMonth||(row.scheduled_date ?? row.due_date).slice(0,7)===dueMonth));
 return <main><AdminNav/><section className="finance-workspace"><h1>Bayi Prim Talepleri Ve Ödemeler</h1><nav className="finance-nav"><Link href="/primler">Personel Ve Yönetici Primleri</Link><Link href="/bayiler">Bayiler</Link></nav><p>Önceki Ay Kesinleşen Primler İçin Ödeme Günü Ayın 5’idir. Havale Bu Ekrandan Gönderilmez. Havale Yapıldıktan Sonra Hesap Ve Referans Girilerek Ödendi Kaydı Oluşturulur. Ödenmeyen Talepler Ve Talep Edilmeyen Primler Korunur.</p>{message&&<p role="status" className="notice">{message}</p>}<section className="form-card dealer-toolbar"><label>Talep Durumu<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="OPEN">Bekleyen Talepler</option><option value="ALL">Tüm Talepler</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Planlanan Ödeme Ayı<input type="month" value={dueMonth} onChange={e=>setDueMonth(e.target.value)}/></label><button disabled={busy||loading} onClick={()=>{setMessage('');void load().catch(e=>setMessage(e.message));}}>Yenile</button></section>
 <section className="table-card"><div className="table-wrap"><table><thead><tr>{['Bayi','Talep Tarihi','Ödeme Günü','Tutar','Hesap Adı / IBAN','Durum','İşlemler'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{shown.map(row=><tr key={row.id}><td>{row.company_name}<small>{row.dealer_code}</small></td><td>{new Date(row.created_at).toLocaleString('tr-TR')}</td><td>{row.scheduled_date ?? row.due_date.slice(0,10)}</td><td>{money(row.amount,row.currency)}</td><td>{row.account_holder}<small>{row.iban}</small></td><td>{statuses[row.status]??row.status}{row.paid_at&&<small>{new Date(row.paid_at).toLocaleString('tr-TR')} · {row.reference_number}</small>}</td><td><div className="button-row">{['REQUESTED','APPROVED'].includes(row.status)&&canApprove&&['ADMIN','SUPER_ADMIN'].includes(role)&&<><input aria-label="Talep Notu" placeholder="Not" value={notes[row.id]??''} onChange={e=>setNotes({...notes,[row.id]:e.target.value})}/>{row.status==='REQUESTED'&&<button disabled={busy} onClick={()=>void act(`/admin/dealer-payouts/${row.id}/decision`,{status:'APPROVED',note:notes[row.id]})}>Talebi Onayla</button>}<button disabled={busy} className="secondary" onClick={()=>void act(`/admin/dealer-payouts/${row.id}/decision`,{status:'REJECTED',note:notes[row.id]})}>Reddet / Ayrılan Primi Serbest Bırak</button></>}{row.status==='APPROVED' && row.payment_allowed === false && <small>Ödeme için {row.scheduled_date ?? row.due_date.slice(0,10)} bekleniyor.</small>}{row.status==='APPROVED' && canApprove && row.payment_allowed === true && <><select aria-label="Ödeme Yapılan Hesap" value={selectedAccounts[row.id]??''} onChange={e=>setSelectedAccounts({...selectedAccounts,[row.id]:e.target.value})}><option value="">Ödeme Yapılan Hesap</option>{accounts.filter(a=>a.currency===row.currency).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><input aria-label="Havale Referansı" placeholder="Havale Referansı / Dekont No" value={references[row.id]??''} onChange={e=>setReferences({...references,[row.id]:e.target.value})}/><button disabled={busy||!selectedAccounts[row.id]||!references[row.id]?.trim()} onClick={()=>void act(`/admin/dealer-payouts/${row.id}/paid`,{accountId:selectedAccounts[row.id],referenceNumber:references[row.id]})}>Havaleyi Yaptım · Ödendi Kaydet</button></>}</div></td></tr>)}{!shown.length&&<tr><td colSpan={7}>{loading ? "Prim talepleri yükleniyor…" : loaded ? "Bu filtrede prim talebi yok." : "Prim talepleri yüklenemedi."}</td></tr>}</tbody></table></div></section>
 {loaded && canRecordFee && <form className="form-card" onSubmit={recordFee}>
  <h2>İade Kargo Ücretini Bayi Priminden Kes</h2>
  <div className="form-grid">
   <label>İade Kaydı<select required disabled={busy||!returns.length} value={selectedReturn?.id??''} onChange={e=>setFee({returnId:e.target.value,amount:'',note:''})}><option value="">Teslim Alınmış İade Seçin</option>{returns.map(row=><option key={row.id} value={row.id}>{row.order_number} · {row.dealer_name} · {new Date(row.requested_at).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'})}</option>)}</select></label>
   <label>Gerçek Kargo Ücreti{selectedReturn&&` (${selectedReturn.currency})`}<input disabled={busy||!selectedReturn} required type="number" min="0.01" step="0.01" value={fee.amount} onChange={e=>setFee({...fee,amount:e.target.value})}/></label>
   <label>Kargo Faturası Referansı veya Açıklama<input disabled={busy||!selectedReturn} required maxLength={500} value={fee.note} onChange={e=>setFee({...fee,note:e.target.value})}/></label>
  </div>
  <button disabled={busy||!selectedReturn}>Kargo Kesintisini Kaydet</button>
 </form>}
 </section></main>;
}
