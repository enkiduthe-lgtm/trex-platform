"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../../components/admin-nav";
import { api } from "../../lib/api";
import { currencyTotals } from "../../lib/report-totals";
import { financeDate } from "../../lib/finance-report";
import { useOrderPermissions } from '../../lib/use-order-permissions';
import { useFinanceSubmission } from '../../lib/use-finance-submission';

type Account = { id:string; name:string; account_type:string; currency:string; is_active:boolean; };
type Settlement = { id:string; account_name:string; currency:string; carrier_name:string; reference_number:string|null; gross_collection_amount:string; shipping_deduction_amount:string; other_deduction_amount:string; net_payout_amount:string; expected_payout_date:string; paid_at:string|null; status:"PLANNED"|"PAID"; note:string|null; };
const money=(value:string,currency="TRY")=>Number(value||0).toLocaleString("tr-TR",{style:"currency",currency});

export default function CarrierSettlements(){
  const {permissions,loading:accessLoading,error:accessError,refresh:refreshPermissions}=useOrderPermissions();
  const submission=useFinanceSubmission('/admin/finance/carrier-settlements/idempotent');
  const [dateFrom,setDateFrom]=useState(""); const [dateTo,setDateTo]=useState("");
  const [accounts,setAccounts]=useState<Account[]>([]); const [items,setItems]=useState<Settlement[]>([]); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({accountId:"",carrierName:"Aras Kargo",grossCollectionAmount:"",shippingDeductionAmount:"",otherDeductionAmount:"",expectedPayoutDate:financeDate(new Date().toISOString()),referenceNumber:"",note:""});
  const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[loadError,setLoadError]=useState(''),[confirmId,setConfirmId]=useState<string|null>(null);
  const alive=useRef(true),lock=useRef(false),version=useRef(0),readyRef=useRef(false);
  const blocked=saving||submission.busy||Boolean(submission.pending)||loading;
  async function load(){
    const ticket=++version.current;readyRef.current=false;setLoading(true);setReady(false);setLoadError('');
    try{const results=await Promise.allSettled([api<Account[]>("/admin/finance/accounts"),api<Settlement[]>("/admin/finance/carrier-settlements")]);
      if(!alive.current||ticket!==version.current)return false;
      const [a,s]=results;
      if(a.status==='fulfilled'&&Array.isArray(a.value)){const active=a.value.filter(x=>x.currency==='TRY'&&x.is_active);setAccounts(active);setForm(current=>active.some(x=>x.id===current.accountId)?current:{...current,accountId:active[0]?.id??''});}
      if(s.status==='fulfilled'&&Array.isArray(s.value))setItems(s.value);
      if(a.status==='rejected'||s.status==='rejected'||!Array.isArray(a.value)||!Array.isArray(s.value))throw new Error('Tahsilat planı veya aktif para hesapları yenilenemedi. Son yüklenen kayıtları kontrol edip yeniden deneyin.');
      setReady(true);readyRef.current=true;return true;
    }catch(error){if(alive.current&&ticket===version.current)setLoadError(error instanceof Error?error.message:'Kargo tahsilatları yüklenemedi.');return false;}
    finally{if(alive.current&&ticket===version.current)setLoading(false);}
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;readyRef.current=false;version.current++;};},[]);
  const net=useMemo(()=>Number((Number(form.grossCollectionAmount||0)-Number(form.shippingDeductionAmount||0)-Number(form.otherDeductionAmount||0)).toFixed(2)),[form]);
  async function savePlan(retry=false){
    if(lock.current||!alive.current||accessLoading||!permissions.financeCreate)return;
    if(!retry&&(!readyRef.current||submission.pending||!accounts.some(x=>x.id===form.accountId)||!form.carrierName.trim()||!form.grossCollectionAmount||!Number.isFinite(net)||net<0||!form.expectedPayoutDate)){setMessage('Aktif TL hesabını, tutarları ve ödeme gününü kontrol edin. Kesintiler brüt tahsilatı aşamaz.');return;}
    lock.current=true;setSaving(true);setMessage('');
    try{const result=retry?await submission.retry():await submission.send(JSON.stringify({...form,carrierName:form.carrierName.trim(),grossCollectionAmount:Number(form.grossCollectionAmount),shippingDeductionAmount:Number(form.shippingDeductionAmount||0),otherDeductionAmount:Number(form.otherDeductionAmount||0),referenceNumber:form.referenceNumber.trim()||undefined,note:form.note.trim()||undefined}));
      if(!alive.current)return;setMessage(result.replayed?'Mevcut tahsilat planı doğrulandı. Güncel ödeme durumunu listeden kontrol edin.':'Kargo tahsilatı ödeme planına eklendi. Para hesabına henüz ödeme işlenmedi.');setForm(current=>({...current,grossCollectionAmount:'',shippingDeductionAmount:'',otherDeductionAmount:'',referenceNumber:'',note:''}));await load();
    }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'Planın sonucu doğrulanamadı.');}
    finally{lock.current=false;if(alive.current)setSaving(false);}
  }
  async function submit(event:FormEvent){event.preventDefault();await savePlan();}
  async function markPaid(id:string){
    if(lock.current||!readyRef.current||submission.pending||accessLoading||!permissions.financeApprove||confirmId!==id)return;
    const target=items.find(item=>item.id===id&&item.status==='PLANNED');if(!target)return;
    lock.current=true;setSaving(true);setMessage('');
    try{const result=await api<{status:string;zeroNet?:boolean;replayed?:boolean}>(`/admin/finance/carrier-settlements/${id}/mark-paid`,{method:'POST'});
      if(!alive.current)return;if(result?.status!=='PAID')throw new Error('Plan kapanış sonucu doğrulanamadı.');
      setConfirmId(null);setMessage(Number(target.net_payout_amount)===0?'Net tutarı sıfır olan plan kapatıldı. Para hareketi oluşturulmadı.':result.replayed?'Bu plan daha önce hesaba işlenmiş. İkinci para hareketi oluşturulmadı.':'Tahsilat para hesabına gelen ödeme olarak işlendi.');await load();
    }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'Ödeme sonucu doğrulanamadı. Kayıtları yenileyin.');}
    finally{lock.current=false;if(alive.current)setSaving(false);}
  }
  const shown=items.filter(item=>{const day=item.expected_payout_date.slice(0,10);return (!dateFrom||day>=dateFrom)&&(!dateTo||day<=dateTo)&&!(dateFrom&&dateTo&&dateFrom>dateTo);});
  const confirmation=items.find(item=>item.id===confirmId&&item.status==='PLANNED');
  const planned=shown.filter(x=>x.status==="PLANNED");
  const plannedTotals=currencyTotals(planned.map(item=>({currency:item.currency,amount:item.net_payout_amount})));
  const deductionTotals=currencyTotals(shown.flatMap(item=>[{currency:item.currency,amount:item.shipping_deduction_amount},{currency:item.currency,amount:item.other_deduction_amount}]));
  return <main><AdminNav/><section><p>FİNANS / KARGO</p><h1>Kargo tahsilat ve ödeme planı</h1><p>Aras Kargo sözleşmenizdeki gerçek tahsilat, kesinti ve ödeme günü bilgilerini buraya işleyin. Planlanan ödeme, para hesabına ancak “Hesaba geldi” denildiğinde kaydolur.</p><p><Link href="/finans">← Finans özetine dön</Link></p><button type="button" className="secondary" disabled={blocked} onClick={()=>void load()}>{loading?'Kayıtlar yükleniyor…':'Kayıtları Yenile'}</button>
 {accessError&&<div role="alert"><p>{accessError}</p><button type="button" onClick={()=>void refreshPermissions()}>Yetkileri Yenile</button></div>}
 {loadError&&<p role="alert">{loadError} Güncel kayıtlar doğrulanana kadar yeni işlem kapalıdır.</p>}
 {submission.pending&&<section className="form-card"><h2>Tahsilat Planını Kontrol Edin</h2><p>Önceki kaydın sonucu doğrulanamadı. Yeni plan girmeden asıl isteği kontrol edin. Sayfayı kapatırsanız önce kayıtlı planları inceleyin.</p><button type="button" disabled={saving||submission.busy||accessLoading||!permissions.financeCreate} onClick={()=>void savePlan(true)}>Tahsilat Planını Doğrula / Yeniden Dene</button></section>}
 {message&&<p role="status">{message}</p>}
    <div className="form-card"><h2>Tahsilat Filtresi</h2><div className="form-grid"><label>Planlanan Ödeme Başlangıç Tarihi<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label>Planlanan Ödeme Bitiş Tarihi<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label></div><button type="button" className="secondary" onClick={()=>{setDateFrom('');setDateTo('');}}>Filtreyi Temizle</button>{dateFrom&&dateTo&&dateFrom>dateTo&&<p role="alert">Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz.</p>}</div>
    <div className="cards"><article><p>Bekleyen Kargo Ödemesi</p>{plannedTotals.length?plannedTotals.map(total=><h2 key={total.currency}>{money(total.amount,total.currency)}</h2>):<h2>—</h2>}<p>{planned.length} Planlı Tahsilat</p></article><article><p>Toplam Kargo Kesintisi</p>{deductionTotals.length?deductionTotals.map(total=><h2 key={total.currency}>{money(total.amount,total.currency)}</h2>):<h2>—</h2>}<p>Seçilen Dönem Toplamı</p></article></div>
    {permissions.financeCreate&&<form className="form-card" onSubmit={submit}><h2>Yeni kargo tahsilat planı</h2><fieldset className="finance-entry-fields" disabled={blocked||!ready||accessLoading}><div className="form-grid"><label>Para hesabı<select required value={form.accountId} onChange={e=>setForm(x=>({...x,accountId:e.target.value}))}><option value="">Hesap seçin</option>{accounts.map(account=><option value={account.id} key={account.id}>{account.name}</option>)}</select></label><label>Kargo firması<input required value={form.carrierName} onChange={e=>setForm(x=>({...x,carrierName:e.target.value}))}/></label><label>Brüt tahsilat<input required min="0" step="0.01" type="number" value={form.grossCollectionAmount} onChange={e=>setForm(x=>({...x,grossCollectionAmount:e.target.value}))}/></label><label>Kargo kesintisi<input min="0" step="0.01" type="number" value={form.shippingDeductionAmount} onChange={e=>setForm(x=>({...x,shippingDeductionAmount:e.target.value}))}/></label><label>Diğer kesinti<input min="0" step="0.01" type="number" value={form.otherDeductionAmount} onChange={e=>setForm(x=>({...x,otherDeductionAmount:e.target.value}))}/></label><label>Planlanan ödeme günü<input required type="date" value={form.expectedPayoutDate} onChange={e=>setForm(x=>({...x,expectedPayoutDate:e.target.value}))}/></label><label>Mutabakat / dekont no<input value={form.referenceNumber} onChange={e=>setForm(x=>({...x,referenceNumber:e.target.value}))}/></label><label className="wide">Not<input value={form.note} onChange={e=>setForm(x=>({...x,note:e.target.value}))}/></label></div><p><strong>Hesaba yatacak net tutar: {money(String(net))}</strong></p>{net<0&&<p role="alert">Kesintiler brüt tahsilattan yüksek olamaz.</p>}<button disabled={blocked||!ready||accessLoading||!accounts.length||net<0}>Ödeme planına ekle</button></fieldset></form>}
    {confirmation&&permissions.financeApprove&&<section className="form-card" aria-label="Tahsilat planı onayı"><h2>{Number(confirmation.net_payout_amount)===0?'Sıfır Net Tutarı Olan Planı Kapat':'Hesaba Gelen Tahsilatı Onayla'}</h2><p>{confirmation.carrier_name} · {confirmation.account_name} · {money(confirmation.net_payout_amount,confirmation.currency)}</p><p>{Number(confirmation.net_payout_amount)===0?'Kesintiler tahsilatın tamamına eşit. Plan kapanır; para hareketi oluşmaz.':'Bu tutarın para hesabınıza gerçekten geçtiğini kontrol edin. Onayla birlikte hesabın bakiyesine eklenir.'}</p><div className="button-row"><button type="button" disabled={blocked||!ready||accessLoading} onClick={()=>void markPaid(confirmation.id)}>Onayla</button><button type="button" className="secondary" disabled={saving} onClick={()=>setConfirmId(null)}>Vazgeç</button></div></section>}
    <div className="table-card"><h2>Kayıtlı Kargo Tahsilatları · {shown.length}</h2><div className="table-wrap"><table><thead><tr><th>Durum</th><th>Kargo</th><th>Planlanan gün</th><th>Brüt tahsilat</th><th>Kargo kesintisi</th><th>Diğer kesinti</th><th>Net ödeme</th><th>Hesap</th><th>Referans</th><th>İşlem</th></tr></thead><tbody>{shown.map(item=><tr key={item.id}><td>{item.status==="PAID"?(Number(item.net_payout_amount)===0?"Kapandı · Net sıfır":"Hesaba geçti"):"Bekliyor"}</td><td>{item.carrier_name}</td><td>{new Date(item.expected_payout_date.slice(0,10)+"T12:00:00+03:00").toLocaleDateString("tr-TR",{timeZone:"Europe/Istanbul"})}</td><td>{money(item.gross_collection_amount,item.currency)}</td><td>{money(item.shipping_deduction_amount,item.currency)}</td><td>{money(item.other_deduction_amount,item.currency)}</td><td><strong>{money(item.net_payout_amount,item.currency)}</strong></td><td>{item.account_name}</td><td>{item.reference_number??"—"}</td><td>{item.status==="PLANNED"?(permissions.financeApprove?<button type="button" disabled={blocked||!ready||accessLoading} onClick={()=>{if(lock.current||!readyRef.current)return;setConfirmId(item.id);}}>{Number(item.net_payout_amount)===0?"Planı Kapat":"Hesaba Geldi"}</button>:<span>Onay yetkisi gerekli</span>):item.paid_at?new Date(item.paid_at).toLocaleDateString("tr-TR",{timeZone:"Europe/Istanbul"}):"İşlendi"}</td></tr>)}</tbody></table></div>{!shown.length&&<p className="empty-state">{loading?'Kayıtlar yükleniyor…':ready?'Bu filtrede kargo tahsilatı planı yok.':'Kayıtlar doğrulanamadı. Yeniden yükleyin.'}</p>}</div></section></main>;
}
