'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsx';
import { currencyTotals } from '../../lib/report-totals';
import { financeDateTime } from '../../lib/finance-report';
import { DealerSale, groupDealerSales } from '../../lib/dealer-sales-report';

type Dealer={id:string;code:string;company_name:string;status:string};
type Filters={dateFrom:string;dateTo:string;dealerId:string;product:string;status:string};
const statusLabels:Record<string,string>={PENDING_PAYMENT:'Ödeme Bekliyor',PAID:'Onaylandı',PROCESSING:'Hazırlanıyor',SHIPPED:'Kargoda',DELIVERED:'Teslim Edildi',CANCELLED:'İptal Edildi',REFUNDED:'İade Edildi'};
const paymentLabels:Record<string,string>={PENDING:'Bekliyor',SUCCEEDED:'Ödendi',FAILED:'Başarısız',REFUNDED:'İade Edildi'};
const money=(amount:string,currency:string)=>Number(amount).toLocaleString('tr-TR',{style:'currency',currency});
const date=(days=0)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-days*86400000));
export default function DealerSalesReport(){
 const [dealers,setDealers]=useState<Dealer[]>([]),[rows,setRows]=useState<DealerSale[]>([]);
 const [filters,setFilters]=useState<Filters>({dateFrom:date(29),dateTo:date(),dealerId:'',product:'',status:''}),[loaded,setLoaded]=useState<Filters|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const requestId=useRef(0);
 async function load(snapshot:Filters){if(!snapshot.dateFrom||!snapshot.dateTo||snapshot.dateFrom>snapshot.dateTo){setMessage('Geçerli Bir Tarih Aralığı Seçin.');return;}const id=++requestId.current;setBusy(true);setRows([]);setLoaded(null);setMessage('');try{const items=await api<DealerSale[]>(`/admin/dealers/sales-report-detail?${new URLSearchParams(snapshot)}`);if(id===requestId.current){setRows(items);setLoaded(snapshot);}}catch(error){if(id===requestId.current)setMessage(error instanceof Error?error.message:'Bayi Satış Raporu Yüklenemedi.');}finally{if(id===requestId.current)setBusy(false);}}
 useEffect(()=>{void api<Dealer[]>('/admin/dealers').then(setDealers).catch(error=>setMessage(error instanceof Error?error.message:'Bayi Listesi Yüklenemedi.'));void load(filters);return ()=>{requestId.current++;};},[]);
 const valid=rows.filter(row=>row.status!=='CANCELLED'),totals=currencyTotals(valid.map(row=>({currency:row.currency,amount:row.line_total})));
 function exportReport(mode:'detail'|'dealer'|'product'|'day'){
  if(!loaded||!rows.length)return;
  const metadata:(string|number)[][]=[['Başlangıç',loaded.dateFrom],['Bitiş',loaded.dateTo],['Bayi',loaded.dealerId?dealers.find(d=>d.id===loaded.dealerId)?.company_name??loaded.dealerId:'Tüm Bayiler'],['Ürün Filtresi',loaded.product],['Durum',statusLabels[loaded.status]??'Tüm Durumlar'],['Not','Tutarlar Ürün Satırlarına Aittir; Kargo Gibi Sipariş Ek Tutarları Dahil Değildir. İptaller Ayrı Durumla Gösterilir.'],[]];
  const data:(string|number)[][]=mode==='detail'?
   [['Bayi','Siparişte Kaydedilmiş Seviye','Tarih','Sipariş','Ürün','SKU','Adet','Birim Fiyat','Ürün Satış Tutarı','Para Birimi','Ödeme Durumu','Sipariş Durumu'],...rows.map(r=>[r.company_name,r.dealer_level_name??'Sipariş Seviyesi Kaydedilmemiş',financeDateTime(r.created_at),r.order_number,r.product_name,r.sku,r.quantity,Number(r.unit_amount),Number(r.line_total),r.currency,paymentLabels[r.payment_status]??r.payment_status,statusLabels[r.status]??r.status])]:
   [['Grup','Sipariş Seviyesi','Durum','Para Birimi','Sipariş Sayısı','Ürün Adedi','Ürün Satış Tutarı'],...groupDealerSales(rows,mode).map(r=>[r.label,r.level,statusLabels[r.status]??r.status,r.currency,r.orderCount,r.quantity,Number(r.amount)])];
  data.push([],['İptaller Hariç Ürün Satış Toplamları','Para Birimi','Tutar'],...totals.map(t=>['Toplam',t.currency,Number(t.amount)]));
  downloadXlsx(`bayi-${mode}-${loaded.dateFrom}-${loaded.dateTo}.xlsx`,'Bayi Satış Raporu',[...metadata,...data]);
 }
 return <main><AdminNav/><section className="dealer-workspace"><h1>Bayi Satış Raporu</h1><p>Her Ürün Ayrı Satırdadır. Sipariş Anındaki Fiyatlar Kullanılır. Seviye Bilgisi Sipariş Kaydından Alınır; Bulunamayan Geçmiş Seviye Bugünkü Seviyeyle Doldurulmaz.</p><nav className="finance-nav"><Link href="/bayiler">Bayiler</Link><Link href="/raporlar">Rapor Merkezi</Link></nav>
 <form className="form-card" onSubmit={e=>{e.preventDefault();void load({...filters});}}><div className="form-grid">
 <label>Başlangıç Tarihi<input required type="date" value={filters.dateFrom} onChange={e=>setFilters(f=>({...f,dateFrom:e.target.value}))}/></label><label>Bitiş Tarihi<input required type="date" value={filters.dateTo} onChange={e=>setFilters(f=>({...f,dateTo:e.target.value}))}/></label>
 <label>Bayi<select value={filters.dealerId} onChange={e=>setFilters(f=>({...f,dealerId:e.target.value}))}><option value="">Tüm Bayiler</option>{dealers.map(d=><option key={d.id} value={d.id}>{d.company_name} · {d.code}{d.status==='ACTIVE'?'':' · Pasif / Başvuru'}</option>)}</select></label>
 <label>Ürün / SKU<input value={filters.product} onChange={e=>setFilters(f=>({...f,product:e.target.value}))}/></label><label>Sipariş Durumu<select value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}><option value="">Tüm Durumlar</option>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
 <div className="button-row"><button disabled={busy}>{busy?'Rapor Yükleniyor…':'Raporu Getir'}</button>{([['detail','Bayi Bazlı Detay'],['dealer','Bayi Özeti'],['product','Ürün Bazlı Satış'],['day','Tarih Bazlı Satış']] as const).map(([mode,label])=><button type="button" key={mode} disabled={busy||!loaded||!rows.length} onClick={()=>exportReport(mode)}>{label}</button>)}</div></form>
 {message&&<p role="alert">{message}</p>}{loaded&&<><p role="status">Gösterilen Dönem: {loaded.dateFrom} — {loaded.dateTo} · İstanbul Saati. Satış Tutarları İptaller Hariç Ürün Satırlarının Toplamıdır; Sipariş Ek Ücretleri Dahil Değildir.</p><div className="cards"><article><p>Filtrelenen Sipariş Sayısı</p><strong>{new Set(rows.map(r=>r.order_id)).size}</strong></article><article><p>İptaller Hariç Ürün Adedi</p><strong>{valid.reduce((n,r)=>n+Number(r.quantity),0)}</strong></article>{totals.map(t=><article key={t.currency}><p>Ürün Satış Tutarı · {t.currency}</p><strong>{money(t.amount,t.currency)}</strong></article>)}</div>
 <section className="table-card"><h2>Sipariş Ve Ürün Satırları</h2><div className="table-wrap"><table><thead><tr><th>Bayi / Sipariş Seviyesi</th><th>Tarih</th><th>Sipariş</th><th>Ürün / SKU</th><th>Adet</th><th>Birim Fiyat</th><th>Ürün Satış Tutarı</th><th>Ödeme</th><th>Durum</th></tr></thead><tbody>{rows.map(r=><tr key={r.item_id}><td><b>{r.company_name}</b><small>{r.dealer_level_name??'Sipariş Seviyesi Kaydedilmemiş'}</small></td><td>{financeDateTime(r.created_at)}</td><td><Link href={`/siparisler/${r.order_id}`}>{r.order_number}</Link></td><td><b>{r.product_name}</b><small>{r.sku}</small></td><td>{r.quantity}</td><td>{money(r.unit_amount,r.currency)}</td><td>{money(r.line_total,r.currency)}</td><td>{(paymentLabels[r.payment_status]??r.payment_status)||'—'}</td><td>{statusLabels[r.status]??r.status}</td></tr>)}</tbody></table>{!rows.length&&<p className="empty-state">Bu Filtrede Bayi Satışı Yok.</p>}</div></section></>}
 </section></main>;
}