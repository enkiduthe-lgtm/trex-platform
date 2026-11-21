'use client';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { downloadXlsx } from '../lib/xlsx';
import styles from './cari.module.css';
import { useOrderPermissions } from '../lib/use-order-permissions';
import { useFinanceSubmission, validFinanceAmount } from '../lib/use-finance-submission';
type Account={party_type:'DEALER'|'CUSTOMER';party_name:string;party_code:string|null;dealer_id:string|null;customer_id:string|null;currency:string;balance:string;last_movement_at:string|null};
type Entry={id:string;direction:'DEBIT'|'CREDIT';entry_type:string;amount:string;currency:string;source_type:string;description:string;due_at:string|null;created_at:string;running_balance:string};
type Balance={currency:string;balance:string;opening_balance:string;period_debit:string;period_credit:string;closing_balance:string};
type Detail={partyType:Account['party_type'];partyId:string;dateFrom:string|null;dateTo:string|null;balances:Balance[];entries:Entry[]};
const labels:Record<string,string>={SALE:'Satış',COLLECTION:'Tahsilat',RETURN:'İade',COMMISSION_USE:'Prim Kullanımı',ADJUSTMENT:'Düzeltme',DEBIT:'Borç',CREDIT:'Alacak'};
const money=(v:string,c:string)=>Number(v).toLocaleString('tr-TR',{style:'currency',currency:c});
const date=(v:string)=>new Date(v).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
const key=(a:Account)=>`${a.party_type}/${a.dealer_id??a.customer_id}`;
export default function CurrentAccounts(){
 const {permissions,loading:accessLoading,error:accessError,refresh:refreshPermissions}=useOrderPermissions();
 const submission=useFinanceSubmission('/admin/current-accounts/entries/idempotent');
 const [accounts,setAccounts]=useState<Account[]>([]),[selected,setSelected]=useState<Account|null>(null),[detail,setDetail]=useState<Detail|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const [query,setQuery]=useState(''),[partyType,setPartyType]=useState(''),[currency,setCurrency]=useState(''),[dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState('');
 const [entry,setEntry]=useState({entryType:'COLLECTION',direction:'CREDIT',amount:'',currency:'TRY',sourceType:'MANUAL',description:'',dueAt:''});
 const [listLoading,setListLoading]=useState(true),[listReady,setListReady]=useState(false),[listError,setListError]=useState(''),[detailError,setDetailError]=useState('');
 const requestId=useRef(0),listRequest=useRef(0),saving=useRef(false),alive=useRef(true),readyRef=useRef(false);
 const paused=busy||submission.busy||Boolean(submission.pending);
 const formLocked=paused||loading||listLoading||!listReady||!detail||accessLoading||!permissions.currentCreate;
 const datesChanged=!!detail&&((detail.dateFrom??'')!==dateFrom||(detail.dateTo??'')!==dateTo);
 async function load(){
  const ticket=++listRequest.current;readyRef.current=false;setListLoading(true);setListReady(false);setListError('');
  try{const result=await api<Account[]>('/admin/current-accounts');if(!alive.current||ticket!==listRequest.current)return false;
   if(!Array.isArray(result))throw new Error('Cari hesap listesi doğrulanamadı.');
   setAccounts(result);setListReady(true);readyRef.current=true;return true;
  }catch(error){if(alive.current&&ticket===listRequest.current)setListError(error instanceof Error?error.message:'Hesaplar alınamadı.');return false;}
  finally{if(alive.current&&ticket===listRequest.current)setListLoading(false);}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;readyRef.current=false;requestId.current++;listRequest.current++;};},[]);
 const shown=useMemo(()=>accounts.filter(a=>(!partyType||a.party_type===partyType)&&(!currency||a.currency===currency)&&`${a.party_name} ${a.party_code??''}`.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR'))),[accounts,partyType,currency,query]);
 async function open(account:Account,from=dateFrom,to=dateTo){
  if(from&&to&&from>to){setDetailError('Başlangıç tarihi bitiş tarihinden sonra olamaz.');return false;}
  const id=++requestId.current;setSelected(account);setDetail(null);setLoading(true);setDetailError('');
  try{const p=new URLSearchParams();if(from)p.set('dateFrom',from);if(to)p.set('dateTo',to);const result=await api<Detail>(`/admin/current-accounts/${key(account)}?${p}`);
   if(!alive.current||id!==requestId.current)return false;
   if(!result||result.partyType!==account.party_type||result.partyId!==(account.dealer_id??account.customer_id)||!Array.isArray(result.entries)||!Array.isArray(result.balances))throw new Error('Cari hesap dökümü doğrulanamadı.');
   setDetail(result);return true;
  }catch(error){if(alive.current&&id===requestId.current)setDetailError(error instanceof Error?error.message:'Cari hareketler alınamadı.');return false;}
  finally{if(alive.current&&id===requestId.current)setLoading(false);}
 }
 async function post(retry=false){
  if(saving.current||!alive.current||accessLoading||!permissions.currentCreate||!selected)return;
  if(!retry&&(!readyRef.current||!detail||loading||submission.pending||detail.partyId!==(selected.dealer_id??selected.customer_id)||detail.partyType!==selected.party_type))return;
  if(!retry&&(!validFinanceAmount(entry.amount)||!entry.description.trim()||!entry.sourceType.trim())){setMessage('Geçerli tutar, belge türü ve açıklama girin.');return;}
  const target=selected,from=dateFrom,to=dateTo;
  const body=JSON.stringify({partyType:target.party_type,partyId:target.dealer_id??target.customer_id,entryType:entry.entryType,direction:entry.entryType==='ADJUSTMENT'?entry.direction:undefined,amount:Number(entry.amount),currency:entry.currency,sourceType:entry.sourceType.trim(),description:entry.description.trim(),dueAt:entry.entryType==='SALE'&&entry.dueAt?entry.dueAt:undefined});
  saving.current=true;setBusy(true);setMessage('');
  try{if(retry)await submission.retry();else await submission.send(body);if(!alive.current)return;
   setEntry(v=>({...v,amount:'',description:'',dueAt:''}));setMessage('Cari hareket kaydedildi. Güncel bakiye ve hareketler yenileniyor.');
   await Promise.all([load(),open(target,from,to)]);
  }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'Cari işlem sonucu doğrulanamadı.');}
  finally{saving.current=false;if(alive.current)setBusy(false);}
 }
 async function add(event:FormEvent){event.preventDefault();await post();}
 function choose(account:Account){
  if(saving.current||paused||!readyRef.current)return;
  if(!selected||key(selected)!==key(account)||entry.currency!==account.currency){
   setEntry(v=>({...v,currency:account.currency,amount:'',description:'',dueAt:''}));
   setMessage('Yeni hesap seçildi. Önceki hesaba ait tutar ve açıklama bu hesaba aktarılmadı.');
  }
  void open(account);
  document.getElementById('cari-detail')?.scrollIntoView({behavior:'smooth'});
 }
 function exportEntries(){if(!selected||!detail||loading||paused||datesChanged||detail.partyId!==(selected.dealer_id??selected.customer_id)||detail.partyType!==selected.party_type)return;downloadXlsx(`trex-cari-${selected.dealer_id??selected.customer_id}.xlsx`,'Cari Hesap',[
  ['Cari Hesap',selected.party_name],['Hesap Türü',selected.party_type==='DEALER'?'Bayi':'Müşteri'],['Başlangıç Tarihi',detail.dateFrom??'Tüm Zamanlar'],['Bitiş Tarihi',detail.dateTo??'Tüm Zamanlar'],[],
  ['Para Birimi','Dönem Başı Bakiye','Dönem Borç','Dönem Alacak','Dönem Sonu Bakiye','Güncel Bakiye'],...detail.balances.map(b=>[b.currency,Number(b.opening_balance),Number(b.period_debit),Number(b.period_credit),Number(b.closing_balance),Number(b.balance)]),[],
  ['Tarih','Hareket','Yön','Borç','Alacak','Para Birimi','Satır Sonu Bakiye','Vade','Belge Türü','Açıklama'],...detail.entries.map(e=>[date(e.created_at),labels[e.entry_type]??e.entry_type,labels[e.direction],e.direction==='DEBIT'?Number(e.amount):'',e.direction==='CREDIT'?Number(e.amount):'',e.currency,Number(e.running_balance),e.due_at??'',e.source_type,e.description])
 ]);}
 return <main><AdminNav/><section className={styles.workspace}><h1>Cari Hesap Yönetimi</h1><button type="button" disabled={paused||listLoading} onClick={()=>void load()}>{listLoading?'Hesaplar yükleniyor…':'Hesapları Yenile'}</button>
 {accessError&&<div role="alert" className={styles.notice}>{accessError}<button type="button" onClick={()=>void refreshPermissions()}>Yetkileri Yenile</button></div>}
 {listError&&<p role="alert" className={styles.notice}>{listError} Yeni hareket kaydetmeden önce hesapları yenileyin.</p>}
 {submission.pending&&<section className={styles.card} aria-label="Sonucu doğrulanamayan cari hareket"><h2>Cari Hareketi Kontrol Edin</h2><p>Önceki işlemin sonucu doğrulanamadı. Aynı kaydı tekrar oluşturmadan asıl isteği kontrol edin. Sayfayı kapatırsanız önce hareket geçmişini inceleyin.</p><button type="button" disabled={busy||submission.busy||accessLoading||!permissions.currentCreate} onClick={()=>void post(true)}>Cari Hareketi Doğrula / Yeniden Dene</button></section>}{message&&<div className={styles.notice} role="status">{message}</div>}
 <article className={styles.card}><h2>Bayi Ve Müşteri Hesapları</h2><div className={styles.toolbar}>
 <label>Hesap Ara<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ad, Firma Veya Kod"/></label>
 <label>Hesap Türü<select value={partyType} onChange={e=>setPartyType(e.target.value)}><option value="">Tüm Hesaplar</option><option value="DEALER">Bayiler</option><option value="CUSTOMER">Müşteriler</option></select></label>
 <label>Para Birimi<select value={currency} onChange={e=>setCurrency(e.target.value)}><option value="">Tüm Para Birimleri</option><option value="TRY">TL</option><option value="EUR">EUR</option><option value="USD">USD</option></select></label>
 </div><div className={styles.table}><table><thead><tr><th>Hesap Adı</th><th>Tür</th><th>Kod / E-posta</th><th>Güncel Bakiye</th><th>Son Hareket</th><th>İşlem</th></tr></thead><tbody>
 {shown.map(a=><tr key={`${key(a)}-${a.currency}`} className={selected&&key(a)===key(selected)?styles.selected:undefined}><td>{a.party_name}</td><td>{a.party_type==='DEALER'?'Bayi':'Müşteri'}</td><td>{a.party_code??'—'}</td><td><strong>{money(a.balance,a.currency)}</strong><small>{Number(a.balance)>0?'Borç':Number(a.balance)<0?'Alacak':'Hesap Kapalı'}</small></td><td>{a.last_movement_at?date(a.last_movement_at):'Hareket Yok'}</td><td><button disabled={paused||!listReady} onClick={()=>choose(a)}>Hareketleri Aç</button></td></tr>)}
 {!shown.length&&<tr><td colSpan={6}>{listLoading?'Hesaplar yükleniyor…':listReady?'Bu filtrede hesap bulunamadı.':'Hesaplar alınamadı. Yeniden yükleyin.'}</td></tr>}</tbody></table></div></article>
 <article id="cari-detail" className={styles.card}><h2>{selected?`${selected.party_name} · Cari Hesap Dökümü`:'Cari Hesap Seçin'}</h2>{selected?<>
 <div className={styles.toolbar}><label>Başlangıç Tarihi<input disabled={paused} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label>Bitiş Tarihi<input disabled={paused} type="date" min={dateFrom||undefined} value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label><button disabled={paused||loading} onClick={()=>void open(selected)}>Hareketleri Getir</button><button disabled={paused||loading} onClick={()=>{setDateFrom('');setDateTo('');void open(selected,'','');}}>Tüm Tarihler</button><button disabled={!detail||loading||paused||datesChanged} onClick={exportEntries}>Excel&apos;e Aktar</button></div>
 {detailError&&<p className={styles.notice} role="alert">{detailError}</p>}{datesChanged&&<p className={styles.notice} role="status">Gösterilen döküm önceki tarih seçimine aittir. Yeni dönemi getirmeden dışa aktarılamaz.</p>}{loading&&<div className={styles.notice} role="status">Hareketler Yükleniyor…</div>}{detail&&<>
 <div className={styles.notice}>Gösterilen Dönem: {detail.dateFrom??'Başlangıçtan'} — {detail.dateTo??'Tüm Kaydedilen Tarihlere'} · {detail.entries.length} Hareket</div>
 <div className={styles.table}><table><thead><tr><th>Para Birimi</th><th>Dönem Başı Bakiye</th><th>Dönem Borç</th><th>Dönem Alacak</th><th>Dönem Sonu Bakiye</th><th>Güncel Bakiye</th></tr></thead><tbody>{detail.balances.map(b=><tr key={b.currency}><td>{b.currency}</td><td>{money(b.opening_balance,b.currency)}</td><td>{money(b.period_debit,b.currency)}</td><td>{money(b.period_credit,b.currency)}</td><td>{money(b.closing_balance,b.currency)}</td><td>{money(b.balance,b.currency)}</td></tr>)}{!detail.balances.length&&<tr><td colSpan={6}>Hesapta Henüz Hareket Yok.</td></tr>}</tbody></table></div>
 <h3>Hareket Geçmişi</h3><div className={styles.table}><table><thead><tr><th>Tarih</th><th>Hareket</th><th>Borç</th><th>Alacak</th><th>Satır Sonu Bakiye</th><th>Vade</th><th>Belge Türü</th><th>Açıklama</th></tr></thead><tbody>{detail.entries.map(e=><tr key={e.id}><td>{date(e.created_at)}</td><td>{labels[e.entry_type]??e.entry_type}</td><td>{e.direction==='DEBIT'?money(e.amount,e.currency):'—'}</td><td>{e.direction==='CREDIT'?money(e.amount,e.currency):'—'}</td><td>{money(e.running_balance,e.currency)}</td><td>{e.due_at?new Date(`${e.due_at.slice(0,10)}T12:00:00`).toLocaleDateString('tr-TR'):'—'}</td><td>{e.source_type}</td><td>{e.description}</td></tr>)}{!detail.entries.length&&<tr><td colSpan={8}>Seçilen Dönemde Cari Hareket Yok.</td></tr>}</tbody></table></div></>}
 </>:<div className={styles.notice}>Üstteki Tablodan Bir Bayi Veya Müşterinin Hareketlerini Açın.</div>}</article>
 {selected&&permissions.currentCreate&&<form className={styles.card} onSubmit={add}><h2>Yeni Cari Hareket</h2><p>Bu kayıt cari borç ve alacağı düzenler; banka tahsilatı veya prim ödemesi başlatmaz. Prim kullanımı bayinin kendi panelindeki sipariş ödemesinde yapılır.</p><fieldset disabled={formLocked} className={styles.entryFields}><div className={styles.grid}>
 <label>Hareket Türü<select disabled={busy} value={entry.entryType} onChange={e=>setEntry(v=>({...v,entryType:e.target.value,direction:e.target.value==='SALE'?'DEBIT':'CREDIT'}))}><option value="SALE">Satış · Borç</option><option value="COLLECTION">Tahsilat · Alacak</option><option value="RETURN">İade · Alacak</option><option value="ADJUSTMENT">Düzeltme</option></select></label>
 {entry.entryType==='ADJUSTMENT'&&<label>Düzeltme Yönü<select disabled={busy} value={entry.direction} onChange={e=>setEntry(v=>({...v,direction:e.target.value}))}><option value="DEBIT">Borç Ekle</option><option value="CREDIT">Alacak Ekle</option></select></label>}
 <label>Tutar<input disabled={busy} required type="number" min="0.01" step="0.01" value={entry.amount} onChange={e=>setEntry(v=>({...v,amount:e.target.value}))}/></label>
 <label>Para Birimi<select disabled={busy} value={entry.currency} onChange={e=>setEntry(v=>({...v,currency:e.target.value,amount:''}))}><option value="TRY">TL</option><option value="EUR">EUR</option><option value="USD">USD</option></select></label>
 {entry.entryType==='SALE'&&<label>Vade Tarihi<input disabled={busy} type="date" value={entry.dueAt} onChange={e=>setEntry(v=>({...v,dueAt:e.target.value}))}/></label>}
 <label>Kaynak / Belge Türü<input disabled={busy} required value={entry.sourceType} onChange={e=>setEntry(v=>({...v,sourceType:e.target.value.toUpperCase()}))}/></label><label>Açıklama<textarea disabled={busy} required value={entry.description} onChange={e=>setEntry(v=>({...v,description:e.target.value}))}/></label>
 </div><footer className={styles.actions}><button disabled={paused||loading}>{busy?'Kaydediliyor…':'Cari Hareketi Kaydet'}</button></footer></fieldset></form>}
 </section></main>;
}
