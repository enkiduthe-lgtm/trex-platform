'use client';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { MetricChart } from '../components/metric-chart';
import { monthlySeries } from '../lib/chart-data';
import { api, ApiError } from '../lib/api';
import { currencyTotals } from '../lib/report-totals';
import { downloadXlsx } from '../lib/xlsx';
import { createRequestGate } from '../lib/async-controls';
import { matchesDealerCommission, dealerCommissionFilterLabels, type DealerCommissionFilter } from '../lib/dealer-commission-search';
import styles from './portal.module.css';
type Earning={id:string;amount:string;currency:string;status:string;entry_kind:string;created_at:string;period_at?:string;available_at:string|null;note:string|null;order_id?:string;order_number:string;product_name:string;sku:string;quantity:number;unit_amount:string};
type Payout={id:string;request_key?:string;amount:string;currency:string;status:string;due_date:string;scheduled_date?:string;created_at:string;paid_at:string|null;reference_number:string|null;note:string|null};
type Fee={id:string;amount:string;currency:string;note:string;created_at:string;order_id?:string;order_number:string};
type Spend={id:string;amount:string;currency:string;created_at:string;order_id?:string;order_number:string;kind:string};
type Data={balance:{available:string;eligible:string};requests:Payout[];deductions:Fee[];earnings:Earning[];sales:{month:string;currency:string;order_count:number;amount:string}[];spends:Spend[]};
const monthOf=(value:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date(value)).slice(0,7);
const date=(value:string)=>new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
const money=(amount:string,currency='TRY')=>Number(amount).toLocaleString('tr-TR',{style:'currency',currency});
const earningDate=(row:Earning)=>row.period_at ?? (row.entry_kind==='REVERSAL' ? row.created_at : row.available_at ?? row.created_at);
const status:Record<string,string>={REQUESTED:'Ödeme Talep Edildi',APPROVED:'Onaylandı · Havale Bekliyor',PAID:'Bankaya Yatırıldı',REJECTED:'Talep Reddedildi',CANCELLED:'İptal Edildi',PENDING:'Kesinleşme Bekliyor',CONFIRMED:'Teslimatla Kesinleşti',AVAILABLE:'Kullanılabilir',REVERSED:'İade / İptal İle Geri Alındı',USED:'Ürün Alımında Kullanıldı',RESERVED:'Ayrıldı'};
export type WalletView={month:string;search:string;movementFilter:DealerCommissionFilter;pendingRequest?:{id:string;amount:string}};
export const createWalletView=():WalletView=>({month:monthOf(new Date().toISOString()),search:'',movementFilter:'ALL'});
export function WalletPanel({onChange,hasPrimaryIban,onOpenOrder,view,onViewChange}:{onChange:()=>void;hasPrimaryIban?:boolean;onOpenOrder?:(id:string)=>void;view:WalletView;onViewChange:Dispatch<SetStateAction<WalletView>>}) {
 const [data,setData]=useState<Data|null>(null),[amount,setAmount]=useState(view.pendingRequest?.amount??''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const {month,search,movementFilter}=view;
 const setMonth=(value:string)=>{if(value)onViewChange(current=>({...current,month:value}));};
 const setSearch=(value:string)=>onViewChange(current=>({...current,search:value}));
 const setMovementFilter=(value:DealerCommissionFilter)=>onViewChange(current=>({...current,movementFilter:value}));
 const [refreshWarning,setRefreshWarning]=useState('');
 const [updatedAt,setUpdatedAt]=useState<string|null>(null);
 const alive=useRef(false);
 const gate=useRef(createRequestGate());
 const fetching=useRef<{ticket:number}|null>(null);
 const key=useRef<{amount:string;id:string}|null>(view.pendingRequest??null);const lock=useRef(false);
 useEffect(()=>{
  const pending=view.pendingRequest;
  if(!pending||busy||!data)return;
  const saved=data.requests.find(row=>row.request_key===pending.id);
  if(!saved)return;
  if(key.current?.id===pending.id)key.current=null;
  setAmount('');setMessage(`Son prim talebiniz kayıtlarda bulundu. Durum: ${status[saved.status]??saved.status}.`);
  onViewChange(current=>current.pendingRequest?.id===pending.id?{...current,pendingRequest:undefined}:current);
  onChange();
 },[data,busy,view.pendingRequest,onViewChange,onChange]);
 async function load(preserveData=false) {
  if(!alive.current || fetching.current&&gate.current.isCurrent(fetching.current.ticket))return;
  const ticket=gate.current.begin();
  fetching.current={ticket};
  setLoading(true);
  try {
   const result=await api<Data>('/dealer-portal/wallet');
   if(alive.current&&gate.current.isCurrent(ticket)){setData(result);setRefreshWarning('');setUpdatedAt(new Date().toISOString());}
  } catch (error) {
   if(alive.current&&gate.current.isCurrent(ticket)){if(!preserveData)setData(null);throw error;}
  } finally {
   if(fetching.current?.ticket===ticket)fetching.current=null;
   if(alive.current&&gate.current.isCurrent(ticket))setLoading(false);
  }
 }
 async function refresh() {
  if (loading || busy) return;
  try { await load(true); setMessage('Prim Bilgileri Güncellendi.');onChange(); }
  catch (error) { setMessage(error instanceof Error ? error.message : 'Prim Bilgileri Yüklenemedi.'); }
 }
 useEffect(()=>{
  alive.current=true;
  void load().catch(e=>setMessage(e instanceof Error?e.message:'Prim Bilgileri Yüklenemedi.'));
  return ()=>{alive.current=false;gate.current.invalidate();};
 },[]);
 useEffect(()=>{
  const refreshVisible=()=>{
   if(!alive.current||document.visibilityState!=='visible'||lock.current||fetching.current||amount.trim())return;
   void load(true).then(()=>{if(alive.current)onChange();}).catch(error=>{
    if(alive.current)setRefreshWarning(error instanceof Error?error.message:'Prim bilgileri yenilenemedi.');
   });
  };
  const timer=window.setInterval(refreshVisible,60_000);
  window.addEventListener('focus',refreshVisible);
  return ()=>{window.clearInterval(timer);window.removeEventListener('focus',refreshVisible);};
 },[amount]);
 const earnings=data?.earnings.filter(row=>monthOf(earningDate(row))===month)??[];
 const shownEarnings=earnings.filter(row=>matchesDealerCommission(row,search,movementFilter));
 const sales=data?.sales.filter(row=>row.month===month)??[];
 const deductions=data?.deductions.filter(row=>monthOf(row.created_at)===month)??[];
 const spends=data?.spends.filter(row=>monthOf(row.created_at)===month)??[];
 const paid=data?.requests.filter(row=>row.paid_at&&monthOf(row.paid_at)===month)??[];
 const earned=useMemo(()=>currencyTotals(earnings.filter(row=>row.entry_kind==='EARN').map(row=>({currency:row.currency,amount:row.amount}))),[earnings]);
 const reversed=currencyTotals(earnings.filter(row=>row.entry_kind==='REVERSAL').map(row=>({currency:row.currency,amount:row.amount})));
 const paidTotals=currencyTotals(paid.map(row=>({currency:row.currency,amount:row.amount})));
 const feeTotals=currencyTotals(deductions.map(row=>({currency:row.currency,amount:row.amount})));
 const spentTotals=currencyTotals(spends.filter(row=>row.kind==='SPEND').map(row=>({currency:row.currency,amount:row.amount})));
 const refundedSpendTotals=currencyTotals(spends.filter(row=>row.kind==='REFUND').map(row=>({currency:row.currency,amount:row.amount})));
 const netTotals=currencyTotals([...earnings.filter(row=>row.status!=='PENDING').map(row=>({currency:row.currency,amount:row.amount})),...deductions.map(row=>({currency:row.currency,amount:'-'+row.amount}))]);
 const reservedTotals=currencyTotals((data?.requests??[]).filter(row=>['REQUESTED','APPROVED'].includes(row.status)).map(row=>({currency:row.currency,amount:row.amount})));
 const productGroups=new Map<string,{name:string;sku:string;currency:string;settled:{currency:string;amount:string}[];pending:{currency:string;amount:string}[]}>();
 for(const row of earnings){
  const groupKey=JSON.stringify([row.sku,row.product_name,row.currency]);
  const group=productGroups.get(groupKey)??{name:row.product_name,sku:row.sku,currency:row.currency,settled:[],pending:[]};
  (row.status==='PENDING'?group.pending:group.settled).push({currency:row.currency,amount:row.amount});
  productGroups.set(groupKey,group);
 }
 const renderTotals=(rows:{currency:string;amount:string}[])=>rows.length?rows.map(row=><strong key={row.currency}>{money(row.amount,row.currency)}</strong>):<span>Kayıt Yok</span>;
 const orderLink=(row:{order_id?:string;order_number:string})=>row.order_id&&onOpenOrder?
  <button type="button" className={styles.orderLink} disabled={busy} aria-label={`${row.order_number} sipariş detayını aç`} onClick={()=>onOpenOrder(row.order_id!)}>{row.order_number} · Detay</button>:row.order_number;
 async function request() {
  if (lock.current || loading || fetching.current || !data || hasPrimaryIban===false&&!view.pendingRequest) return;
  lock.current=true;setBusy(true);setMessage('');
  try {
   const rawAmount=view.pendingRequest?.amount??amount;
   const value=Number(rawAmount);
   if (!/^\d+(?:\.\d{1,2})?$/.test(rawAmount) || !Number.isFinite(value) || value<=0) {
    throw new Error('En Fazla İki Ondalık Basamakla Geçerli Bir Tutar Girin.');
   }
   if (!view.pendingRequest&&value>Number(data.balance.eligible)) throw new Error('Talep Tutarı Nakit Talep Edilebilir Primi Aşamaz.');
   const normalized=value.toFixed(2);
   if (key.current?.amount!==normalized) key.current={amount:normalized,id:crypto.randomUUID()};
   const attempt=key.current;
   onViewChange(current=>({...current,pendingRequest:attempt}));
   try {
    const result=await api<{id:string}>('/dealer-portal/payout-requests',{method:'POST',body:JSON.stringify({requestKey:attempt.id,amount:value})});
    if(!result||typeof result.id!=='string'||!result.id)throw new Error('Prim talebi yanıtı doğrulanamadı. Aynı talebi yeniden kontrol edin.');
   }catch(error){
    if(error instanceof ApiError&&error.status>=400&&error.status<500&&![408,429,499].includes(error.status)){
     key.current=null;
     onViewChange(current=>current.pendingRequest?.id===attempt.id?{...current,pendingRequest:undefined}:current);
    }
    throw error;
   }
   onViewChange(current=>current.pendingRequest?.id===attempt.id?{...current,pendingRequest:undefined}:current);
   key.current=null;setAmount('');
   const confirmation='Prim Talebi Müdüre Gönderildi. Havale Yapılınca Ödeme Durumu Güncellenecek.';
   try { await load();setMessage(confirmation); }
   catch { setMessage(confirmation+' Güncel Bakiye Yüklenemedi. Prim Bilgilerini Yenileyin.'); }
   onChange();
  } catch (error) { setMessage(error instanceof Error?error.message:'Talep Oluşturulamadı.'); }
  finally { lock.current=false;setBusy(false); }
 }
 function exportReport(){if(!data)return;downloadXlsx('bayi-prim-detayi.xlsx','Prim Detayı',[
  ['Dönem',month],['Prim hareketi araması',search.trim()],['Prim hareketi filtresi',dealerCommissionFilterLabels[movementFilter]],['Filtre kapsamı','Yalnız sipariş ve ürün bazında prim hareketleri; dönem toplamları tüm ayı kapsar.'],[],['Dönem Satışı','Net Satış Tutarı','Para Birimi','Sipariş Adedi'],...sales.map(row=>[row.month,Number(row.amount),row.currency,row.order_count]),
  [],['İşlem Tarihi','Sipariş','Ürün','SKU','Adet','Prim Tutarı','Para Birimi','Durum'],...shownEarnings.map(row=>[date(earningDate(row)),row.order_number,row.product_name,row.sku,row.quantity,Number(row.amount),row.currency,row.entry_kind==='REVERSAL'?'Prim Ters Kaydı':status[row.status]??row.status]),
  [],['Ürün Bazında Prim','SKU','Para Birimi','Kesinleşmiş Net Prim','Bekleyen Prim'],
  ...[...productGroups.values()].map(row=>[row.name,row.sku,row.currency,Number(currencyTotals(row.settled)[0]?.amount??0),Number(currencyTotals(row.pending)[0]?.amount??0)]),
  [],['Kargo Kesintileri','Sipariş','Tutar','Para Birimi','Açıklama'],...deductions.map(row=>[date(row.created_at),row.order_number,Number(row.amount),row.currency,row.note]),
  [],['Primle Ürün Alımı / İadesi','Sipariş','Tutar','Para Birimi','İşlem'],...spends.map(row=>[date(row.created_at),row.order_number,Number(row.amount),row.currency,row.kind==='SPEND'?'Ürün Alımında Kullanıldı':'Prime Geri Verildi']),
  [],['Tüm Ödeme Talepleri — Dönem Filtresinden Bağımsız'],['Talep Tarihi','Ödeme Günü','Tutar','Para Birimi','Durum','Yatırılma Tarihi','Havale Referansı','Not'],...data.requests.map(row=>[date(row.created_at),row.scheduled_date ?? row.due_date.slice(0,10),Number(row.amount),row.currency,status[row.status]??row.status,row.paid_at?date(row.paid_at):'Henüz Yatırılmadı',row.reference_number??'',row.note??'']),
  [],['Dönem Toplamları','Tutar','Para Birimi'],
  ...([['Kazanılan Prim — Bekleyenler Dahil',earned],['Prim Ters Kayıtları',reversed],['İade Kargo Kesintileri',feeTotals],['Ürün Alımında Kullanılan',spentTotals],['Ürün Alımından Geri Verilen',refundedSpendTotals],['Bankaya Yatırılan',paidTotals],['Kesinleşmiş Net Prim Hareketi — Kullanım Ve Ödemeler Hariç',netTotals]] as const).flatMap(([label,totals])=>totals.map(total=>[label,Number(total.amount),total.currency])),
  [],['Bankaya Yatırılan Prim','Tutar','Para Birimi','Havale Referansı'],...paid.map(row=>[date(row.paid_at!),Number(row.amount),row.currency,row.reference_number??'']),
 ]);}
 if (!data) return <section id="bayi-prim-ekrani" tabIndex={-1} className={styles.box}><h2>Primlerim Ve Ödeme Taleplerim</h2><p role="status">{loading?'Prim Bilgileri Yükleniyor…':message||'Prim Bilgileri Yüklenemedi.'}</p><button type="button" disabled={loading||busy} onClick={()=>void refresh()}>Prim Bilgilerini Yenile</button></section>;
 return <section id="bayi-prim-ekrani" tabIndex={-1} className={styles.box}><h2>Primlerim Ve Ödeme Taleplerim</h2><p>Prim Kargo Tesliminde Kesinleşir. Önceki Aylardan Kesinleşmiş Primler İçin Talep Oluşturabilirsiniz. Nakit Ödeme Günü Ayın 5’idir. Ayın 5’inden Sonraki Talepler Sonraki Ödeme Gününe Planlanır. Talep Edilmeyen Ve Ödenmeyen Bakiye Devreder.</p>{message&&<p className="notice" role="status">{message}</p>}{refreshWarning&&<p className="notice" role="alert">{refreshWarning} Son yüklenen prim kayıtları gösteriliyor.</p>}
 {updatedAt&&<p className={styles.refreshInfo}>Son güncelleme {date(updatedAt)} · Talep tutarı girilirken otomatik yenileme bekler.</p>}
 {view.pendingRequest&&!busy&&<p className="notice" role="status">Son {money(view.pendingRequest.amount)} tutarındaki talebin sonucu henüz doğrulanmadı. Prim Bilgilerini Yenile ile kayıtları kontrol edin veya aynı talebi yeniden deneyin. Sonuç doğrulanana kadar tutar değiştirilemez.</p>}
 {hasPrimaryIban===false&&<p className="notice" role="status">Nakit prim talebi için müdürün hesap sahibi adınızı ve IBAN bilginizi kaydetmesi gerekiyor. Kesinleşmiş priminizi ürün alımında kullanabilirsiniz.</p>}
 <div className={styles.cards}><article><h3>Tüm Dönem Kullanılabilir Prim</h3><strong>{data?money(data.balance.available):'—'}</strong><small>Ürün Alımında Kullanılabilir. Talebe Ayrılanlar, Ödemeler Ve Kesintiler Düşülmüştür.</small></article><article><h3>Nakit Talep Edilebilir Prim</h3><strong>{data?money(String(Math.max(0,Number(data.balance.eligible)))):'—'}</strong><small>Önceki Aylardan Kesinleşen Bakiye</small></article><article><h3>Prim Ödeme Talebi</h3><label>Tutar (TL)<input type="number" disabled={loading||busy||!!view.pendingRequest} max={view.pendingRequest?undefined:Math.max(0,Number(data.balance.eligible))} min="0.01" step="0.01" value={view.pendingRequest?.amount??amount} onChange={e=>setAmount(e.target.value)}/></label><button type="button" disabled={loading||busy||!view.pendingRequest&&(hasPrimaryIban===false||Number(data.balance.eligible)<=0)} onClick={()=>void request()}>{view.pendingRequest?'Aynı Talebi Doğrula / Yeniden Dene':'Prim Talep Et'}</button></article></div>
 <div className="analytics-grid"><MetricChart loading={!data&&!message} unavailable={!data&&!!message} title="Aylık Net Prim Hareketlerim" description="Son 6 Ay · TL · Bekleyen Primler Hariç · Ters Kayıtlar Ve İade Kargo Kesintileri Dahil" currency="TRY" data={monthlySeries([...(data?.earnings??[]).filter(row=>row.status!=='PENDING').map(row=>({...row,created_at:earningDate(row)})),...(data?.deductions??[]).map(row=>({...row,amount:String(-Number(row.amount))}))],'TRY',month?new Date(month+'-15T12:00:00+03:00'):new Date())}/><MetricChart loading={!data&&!message} unavailable={!data&&!!message} title="Prim Ödeme Taleplerim" description="Tüm Dönemler · Talep Adedi · Yalnız Kendi Hesabınız" variant="ring" data={Object.entries((data?.requests??[]).reduce<Record<string,number>>((map,row)=>{const key=status[row.status]??row.status;map[key]=(map[key]??0)+1;return map;},{})).map(([label,value])=>({label,value}))}/></div>
 <div className={styles.actions}><button type="button" disabled={loading||busy} onClick={()=>void refresh()}>Prim Bilgilerini Yenile</button><label>Prim Ve Satış Dönemi<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button onClick={()=>setMonth(monthOf(new Date().toISOString()))}>Bu Ay</button><button onClick={()=>{const [year,currentMonth]=monthOf(new Date().toISOString()).split('-').map(Number);setMonth(monthOf(new Date(Date.UTC(year,currentMonth-2,15)).toISOString()));}}>Önceki Ay</button><button disabled={!data||busy} onClick={exportReport}>Excel&apos;e Aktar</button></div>
 <div className={styles.cards}><article><h3>Seçilen Ayın Satışı</h3>{sales.map(row=><p key={row.currency}><b>{money(row.amount,row.currency)}</b> · {row.order_count} Sipariş</p>)}<small>İptaller ve tam iadeler hariç. Kaydedilen kısmi iade tutarları düşülür.</small></article><article><h3>Kazanılan Prim</h3>{renderTotals(earned)}<small>Seçilen dönemin prim kayıtları · Bekleyenler dahil</small></article><article><h3>Prim Ters Kayıtları</h3>{renderTotals(reversed)}</article><article><h3>İade Kargo Kesintileri</h3>{renderTotals(feeTotals)}</article><article><h3>Ürün Alımında Kullanılan</h3>{renderTotals(spentTotals)}</article><article><h3>Ürün Alımından Geri Verilen</h3>{renderTotals(refundedSpendTotals)}</article><article><h3>Bankaya Yatırılan</h3>{renderTotals(paidTotals)}</article></div>
 <div className={styles.cards}><article><h3>Seçilen Ay Net Prim</h3>{renderTotals(netTotals)}<small>Kesinleşmiş Prim + Ters Kayıtlar − Kargo Kesintileri. Ürün Alımı Ve Banka Ödemeleri Hariç; Kullanılabilir Bakiye Değildir.</small></article><article><h3>Ödeme Taleplerine Ayrılmış Prim</h3>{renderTotals(reservedTotals)}<small>Tüm Dönemler · Henüz Bankaya Yatırılmadı</small></article></div><h3>Ürün Bazında Prim</h3><div className={styles.table}><table><thead><tr><th>Ürün</th><th>SKU</th><th>Kesinleşmiş Net Prim</th><th>Bekleyen Prim</th></tr></thead><tbody>{!productGroups.size&&<tr><td colSpan={4}>Bu Dönemde Ürün Primi Yok.</td></tr>}{[...productGroups.entries()].map(([key,row])=><tr key={key}><td>{row.name}</td><td>{row.sku}</td><td>{money(currencyTotals(row.settled)[0]?.amount??'0',row.currency)}</td><td>{money(currencyTotals(row.pending)[0]?.amount??'0',row.currency)}</td></tr>)}</tbody></table></div>
 <h3>Sipariş Ve Ürün Bazında Prim Hareketleri</h3>
 <div className={styles.commissionFilters}>
  <label>Sipariş, ürün veya açıklama ara<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Sipariş numarası, ürün, SKU veya açıklama"/></label>
  <label>Prim hareketi<select value={movementFilter} onChange={event=>setMovementFilter(event.target.value as DealerCommissionFilter)}>{Object.entries(dealerCommissionFilterLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  <button type="button" className="secondary" onClick={()=>{setSearch('');setMovementFilter('ALL');}}>Aramayı Temizle</button>
 </div>
 <p className={styles.refreshInfo}>{shownEarnings.length} / {earnings.length} prim hareketi gösteriliyor. Arama ve hareket filtresi yalnız bu tabloya ve Excel’deki prim hareketlerine uygulanır. Dönem kartları ve ürün özetleri seçilen ayın tamamını kapsar.</p>
 <div className={styles.table}><table><thead><tr><th>Tarih</th><th>Sipariş</th><th>Ürün / SKU</th><th>Sipariş adedi</th><th>Prim</th><th>Durum</th><th>Açıklama</th></tr></thead><tbody>{shownEarnings.map(row=><tr key={row.id}><td>{date(earningDate(row))}</td><td>{orderLink(row)}</td><td>{row.product_name} · {row.sku}</td><td>{row.quantity}</td><td>{money(row.amount,row.currency)}</td><td>{row.entry_kind==='REVERSAL'?'Prim Ters Kaydı':status[row.status]??row.status}</td><td>{row.note||'—'}</td></tr>)}{!shownEarnings.length&&<tr><td colSpan={7}>{earnings.length?'Aramaya ve seçilen duruma uygun prim hareketi bulunamadı.':'Bu dönemde prim hareketi yok.'}</td></tr>}</tbody></table></div>
 <h3>Kargo Kesintileri</h3><div className={styles.table}><table><thead><tr><th>Tarih</th><th>Sipariş</th><th>Kesinti</th><th>Açıklama</th></tr></thead><tbody>{!deductions.length&&<tr><td colSpan={4}>Bu Dönemde Kargo Kesintisi Yok.</td></tr>}{deductions.map(row=><tr key={row.id}><td>{date(row.created_at)}</td><td>{orderLink(row)}</td><td>{money(row.amount,row.currency)}</td><td>{row.note}</td></tr>)}</tbody></table></div>
 <h3>Primle Ürün Alımı Ve İadeleri</h3><div className={styles.table}><table><thead><tr><th>Tarih</th><th>Sipariş</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>{!spends.length&&<tr><td colSpan={4}>Bu Dönemde Primle Ürün Alımı Veya İadesi Yok.</td></tr>}{spends.map(row=><tr key={row.id}><td>{date(row.created_at)}</td><td>{orderLink(row)}</td><td>{money(row.amount,row.currency)}</td><td>{row.kind==='SPEND'?'Ürün Alımında Kullanıldı':'Prim Bakiyesine Geri Verildi'}</td></tr>)}</tbody></table></div>
 <h3>Tüm Ödeme Taleplerim</h3><div className={styles.table}><table><thead><tr><th>Talep Tarihi</th><th>Ödeme Günü</th><th>Tutar</th><th>Durum</th><th>Yatırılma Tarihi</th><th>Havale Referansı</th><th>Not</th></tr></thead><tbody>{data&&!data.requests.length&&<tr><td colSpan={7}>Henüz Ödeme Talebi Yok.</td></tr>}{data?.requests.map(row=><tr key={row.id}><td>{date(row.created_at)}</td><td>{row.scheduled_date ?? row.due_date.slice(0,10)}</td><td>{money(row.amount,row.currency)}</td><td>{status[row.status]??row.status}</td><td>{row.paid_at?date(row.paid_at):'Henüz Yatırılmadı'}</td><td>{row.reference_number||'—'}</td><td>{row.note||'—'}</td></tr>)}</tbody></table></div>
 </section>;
}
