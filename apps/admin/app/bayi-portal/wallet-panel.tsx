'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { currencyTotals } from '../lib/report-totals';
import { downloadXlsx } from '../lib/xlsx';
import styles from './portal.module.css';
type Earning={id:string;amount:string;currency:string;status:string;entry_kind:string;created_at:string;available_at:string|null;note:string|null;order_number:string;product_name:string;sku:string;quantity:number;unit_amount:string};
type Payout={id:string;amount:string;currency:string;status:string;due_date:string;created_at:string;paid_at:string|null;reference_number:string|null;note:string|null};
type Fee={id:string;amount:string;currency:string;note:string;created_at:string;order_number:string};
type Spend={id:string;amount:string;currency:string;created_at:string;order_number:string;kind:string};
type Data={balance:{available:string;eligible:string};requests:Payout[];deductions:Fee[];earnings:Earning[];sales:{month:string;currency:string;order_count:number;amount:string}[];spends:Spend[]};
const monthOf=(value:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date(value)).slice(0,7);
const date=(value:string)=>new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
const money=(amount:string,currency='TRY')=>Number(amount).toLocaleString('tr-TR',{style:'currency',currency});
const status:Record<string,string>={REQUESTED:'Ödeme Talep Edildi',APPROVED:'Onaylandı · Havale Bekliyor',PAID:'Bankaya Yatırıldı',REJECTED:'Talep Reddedildi',CANCELLED:'İptal Edildi',PENDING:'Kesinleşme Bekliyor',CONFIRMED:'Teslimatla Kesinleşti',AVAILABLE:'Kullanılabilir',REVERSED:'İade / İptal İle Geri Alındı',USED:'Ürün Alımında Kullanıldı',RESERVED:'Ayrıldı'};
export function WalletPanel({onChange}:{onChange:()=>void}) {
 const [data,setData]=useState<Data|null>(null),[month,setMonth]=useState(monthOf(new Date().toISOString())),[amount,setAmount]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const key=useRef<{amount:string;id:string}|null>(null);const lock=useRef(false);
 async function load(){setData(await api<Data>('/dealer-portal/wallet'));}
 useEffect(()=>{void load().catch(e=>setMessage(e instanceof Error?e.message:'Prim Bilgileri Yüklenemedi.'));},[]);
 const earnings=data?.earnings.filter(row=>monthOf(row.created_at)===month)??[];
 const deductions=data?.deductions.filter(row=>monthOf(row.created_at)===month)??[];
 const spends=data?.spends.filter(row=>monthOf(row.created_at)===month)??[];
 const paid=data?.requests.filter(row=>row.paid_at&&monthOf(row.paid_at)===month)??[];
 const earned=useMemo(()=>currencyTotals(earnings.filter(row=>row.entry_kind==='EARN').map(row=>({currency:row.currency,amount:row.amount}))),[earnings]);
 const reversed=currencyTotals(earnings.filter(row=>row.entry_kind==='REVERSAL').map(row=>({currency:row.currency,amount:row.amount})));
 const paidTotals=currencyTotals(paid.map(row=>({currency:row.currency,amount:row.amount})));
 const feeTotals=currencyTotals(deductions.map(row=>({currency:row.currency,amount:row.amount})));
 const spentTotals=currencyTotals(spends.filter(row=>row.kind==='SPEND').map(row=>({currency:row.currency,amount:row.amount})));
 const netTotals=currencyTotals([...earnings.filter(row=>row.status!=='PENDING').map(row=>({currency:row.currency,amount:row.amount})),...deductions.map(row=>({currency:row.currency,amount:'-'+row.amount}))]);
 const reservedTotals=currencyTotals((data?.requests??[]).filter(row=>['REQUESTED','APPROVED'].includes(row.status)).map(row=>({currency:row.currency,amount:row.amount})));
 const productGroups=new Map<string,{name:string;sku:string;currency:string;amounts:{currency:string;amount:string}[]}>();
 for(const row of earnings){const groupKey=JSON.stringify([row.sku,row.product_name,row.currency]);const group=productGroups.get(groupKey)??{name:row.product_name,sku:row.sku,currency:row.currency,amounts:[]};group.amounts.push({currency:row.currency,amount:row.amount});productGroups.set(groupKey,group);}
 const renderTotals=(rows:{currency:string;amount:string}[])=>rows.length?rows.map(row=><strong key={row.currency}>{money(row.amount,row.currency)}</strong>):<span>Kayıt Yok</span>;
 async function request(){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{
  if(!amount||!Number.isFinite(Number(amount))||Number(amount)<=0)throw new Error('Geçerli Bir Talep Tutarı Girin.');
  if(key.current?.amount!==amount)key.current={amount,id:crypto.randomUUID()};
  await api('/dealer-portal/payout-requests',{method:'POST',body:JSON.stringify({requestKey:key.current.id,amount:Number(amount)})});
  key.current=null;setAmount('');setMessage('Prim Talebi Yöneticiye Gönderildi. Havale Yapılınca Ödeme Durumu Güncellenecek.');await load();onChange();
 }catch(e){setMessage(e instanceof Error?e.message:'Talep Oluşturulamadı.');}finally{lock.current=false;setBusy(false);}}
 function exportReport(){if(!data)return;downloadXlsx('bayi-prim-detayi.xlsx','Prim Detayı',[
  ['Dönem',month],[],['Tarih','Sipariş','Ürün','SKU','Adet','Prim Tutarı','Para Birimi','Durum'],...earnings.map(row=>[date(row.created_at),row.order_number,row.product_name,row.sku,row.quantity,row.amount,row.currency,row.entry_kind==='REVERSAL'?'Prim Ters Kaydı':status[row.status]??row.status]),
  [],['Kargo Kesintileri','Sipariş','Tutar','Para Birimi','Açıklama'],...deductions.map(row=>[date(row.created_at),row.order_number,row.amount,row.currency,row.note]),
  [],['Primle Ürün Alımı / İadesi','Sipariş','Tutar','Para Birimi','İşlem'],...spends.map(row=>[date(row.created_at),row.order_number,row.amount,row.currency,row.kind==='SPEND'?'Ürün Alımında Kullanıldı':'Prime Geri Verildi']),
  [],['Bankaya Yatırılan Prim','Tutar','Para Birimi','Havale Referansı'],...paid.map(row=>[date(row.paid_at!),row.amount,row.currency,row.reference_number??'']),
 ]);}
 return <section className={styles.box}><h2>Primlerim Ve Ödeme Taleplerim</h2><p>Prim Kargo Tesliminde Kesinleşir. Önceki Aylardan Kesinleşmiş Primler İçin Talep Oluşturabilirsiniz. Nakit Ödeme Günü Ayın 5’idir. Ayın 5’inden Sonraki Talepler Sonraki Ödeme Gününe Planlanır. Talep Edilmeyen Ve Ödenmeyen Bakiye Devreder.</p>{message&&<p className="notice" role="status">{message}</p>}
 <div className={styles.cards}><article><h3>Tüm Dönem Kullanılabilir Prim</h3><strong>{data?money(data.balance.available):'—'}</strong><small>Ürün Alımında Kullanılabilir. Talebe Ayrılanlar, Ödemeler Ve Kesintiler Düşülmüştür.</small></article><article><h3>Nakit Talep Edilebilir Prim</h3><strong>{data?money(String(Math.max(0,Number(data.balance.eligible)))):'—'}</strong><small>Önceki Aylardan Kesinleşen Bakiye</small></article><article><h3>Prim Ödeme Talebi</h3><label>Tutar (TL)<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><button disabled={!data||busy||Number(data.balance.eligible)<=0} onClick={()=>void request()}>Prim Talep Et</button></article></div>
 <div className={styles.actions}><label>Prim Ve Satış Dönemi<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button onClick={()=>setMonth(monthOf(new Date().toISOString()))}>Bu Ay</button><button onClick={()=>{const [year,currentMonth]=monthOf(new Date().toISOString()).split('-').map(Number);setMonth(monthOf(new Date(Date.UTC(year,currentMonth-2,15)).toISOString()));}}>Önceki Ay</button><button disabled={!data||busy} onClick={exportReport}>Excel&apos;e Aktar</button></div>
 <div className={styles.cards}><article><h3>Seçilen Ayın Satışı</h3>{data?.sales.filter(row=>row.month===month).map(row=><p key={row.currency}><b>{money(row.amount,row.currency)}</b> · {row.order_count} Sipariş</p>)}<small>İptaller Hariç; Kaydedilen İade Tutarları Düşülmüştür.</small></article><article><h3>Kazanılan Prim</h3>{renderTotals(earned)}<small>Bu Ay Oluşan Prim Kayıtları</small></article><article><h3>Prim Ters Kayıtları</h3>{renderTotals(reversed)}</article><article><h3>İade Kargo Kesintileri</h3>{renderTotals(feeTotals)}</article><article><h3>Ürün Alımında Kullanılan</h3>{renderTotals(spentTotals)}</article><article><h3>Bankaya Yatırılan</h3>{renderTotals(paidTotals)}</article></div>
 <div className={styles.cards}><article><h3>Seçilen Ay Net Prim</h3>{renderTotals(netTotals)}<small>Kazanılan Prim + Ters Kayıtlar − Kargo Kesintileri</small></article><article><h3>Ödeme Taleplerine Ayrılmış Prim</h3>{renderTotals(reservedTotals)}<small>Tüm Dönemler · Henüz Bankaya Yatırılmadı</small></article></div><h3>Ürün Bazında Prim</h3><div className={styles.table}><table><thead><tr><th>Ürün</th><th>SKU</th><th>Dönem Net Prim Hareketi</th></tr></thead><tbody>{[...productGroups.entries()].map(([key,row])=><tr key={key}><td>{row.name}</td><td>{row.sku}</td><td>{money(currencyTotals(row.amounts)[0].amount,row.currency)}</td></tr>)}</tbody></table></div>
 <h3>Sipariş Ve Ürün Bazında Prim Hareketleri</h3><div className={styles.table}><table><thead><tr><th>Tarih</th><th>Sipariş</th><th>Ürün / SKU</th><th>Adet</th><th>Prim</th><th>Durum</th><th>Açıklama</th></tr></thead><tbody>{earnings.map(row=><tr key={row.id}><td>{date(row.created_at)}</td><td>{row.order_number}</td><td>{row.product_name} · {row.sku}</td><td>{row.quantity}</td><td>{money(row.amount,row.currency)}</td><td>{row.entry_kind==='REVERSAL'?'Prim Ters Kaydı':status[row.status]??row.status}</td><td>{row.note||'—'}</td></tr>)}{!earnings.length&&<tr><td colSpan={7}>Bu Dönemde Prim Hareketi Yok.</td></tr>}</tbody></table></div>
 <h3>Kargo Kesintileri</h3><div className={styles.table}><table><thead><tr><th>Tarih</th><th>Sipariş</th><th>Kesinti</th><th>Açıklama</th></tr></thead><tbody>{deductions.map(row=><tr key={row.id}><td>{date(row.created_at)}</td><td>{row.order_number}</td><td>{money(row.amount,row.currency)}</td><td>{row.note}</td></tr>)}</tbody></table></div>
 <h3>Primle Ürün Alımı Ve İadeleri</h3><div className={styles.table}><table><thead><tr><th>Tarih</th><th>Sipariş</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>{spends.map(row=><tr key={row.id}><td>{date(row.created_at)}</td><td>{row.order_number}</td><td>{money(row.amount,row.currency)}</td><td>{row.kind==='SPEND'?'Ürün Alımında Kullanıldı':'Prim Bakiyesine Geri Verildi'}</td></tr>)}</tbody></table></div>
 <h3>Tüm Ödeme Taleplerim</h3><div className={styles.table}><table><thead><tr><th>Talep Tarihi</th><th>Ödeme Günü</th><th>Tutar</th><th>Durum</th><th>Yatırılma Tarihi</th><th>Havale Referansı</th><th>Not</th></tr></thead><tbody>{data?.requests.map(row=><tr key={row.id}><td>{date(row.created_at)}</td><td>{row.due_date.slice(0,10)}</td><td>{money(row.amount,row.currency)}</td><td>{status[row.status]??row.status}</td><td>{row.paid_at?date(row.paid_at):'Henüz Yatırılmadı'}</td><td>{row.reference_number||'—'}</td><td>{row.note||'—'}</td></tr>)}</tbody></table></div>
 </section>;
}
