'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { downloadXlsx } from '../lib/xlsx';
import { salesGroups } from '../lib/sales-groups';
import styles from './reports.module.css';

type Row = { status?: string; sales_channel?: string; label?: string; sku?: string; count: number; amount: string };
type Report = { dateFrom: string; dateTo: string; currency: string; totals: { order_count: number; revenue: string; average_order: string }; financial: { income: string; expense: string; net: string }; statuses: Row[]; channels: Row[]; daily: Row[]; topProducts: Row[] };
type Operations = { returns_open: number; returns_refunded: number; shipments_active: number; shipments_failed: number; support_overdue: number };
type Filters = { dateFrom: string; dateTo: string; currency: string };
const calendarDate = (days=0) => new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-days*86400000));
const channel = (value:string) => ({PUBLIC_WEB:'Site Satışı',ADMIN_ORDER:'Yönetici Siparişi',RETAIL:'Perakende',DEALER_PORTAL:'Sistem Bayi',WHOLESALE:'Toptan',INSTAGRAM:'Instagram',MARKETPLACE:'Pazaryeri'}[value]??value);
const statusName = (value:string) => ({PENDING_PAYMENT:'Ödeme Bekliyor',PAID:'Onaylandı',PROCESSING:'Hazırlanıyor',SHIPPED:'Kargoda',DELIVERED:'Teslim Edildi',CANCELLED:'İptal Edildi',REFUNDED:'İade Edildi'}[value]??value);
function ReportTable({title,headers,rows}:{title:string;headers:string[];rows:(string|number)[][]}) {
 return <section className="table-card"><h2>{title}</h2><div className={styles.tableWrap}><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="empty-state">Bu Dönemde Kayıt Yok.</p>}</div></section>;
}
const reportCatalog = [
  ['Günlük Satış Özeti', 'Günlük olarak gerçekleşen sipariş sayıları, satış tutarları ve iade oranları.', 'Satışlar'],
  ['Platform Satış Performansı', 'Siparişlerin pazaryerlerine göre dağılımı, satış tutarları ve iade oranları.', 'Satışlar'],
  ['Stok Durum Raporu', 'Genel stok seviyelerinin ürün bazında listesi.', 'Ürünler'],
  ['Ürün Satış Raporu', 'Ürünlerin satış miktarı, iade miktarı ve tutarları.', 'Ürün Bazlı Satışlar'],
  ['Günlük Yeni Üye Kaydı', 'Sisteme kayıt olan üyelerin günlük sayıları.', 'Müşteriler'],
  ['Günlük Ziyaretçi Özeti', 'Günlük ziyaretçi sayıları, davranışları ve dönüşüm oranları.', 'Ziyaretçiler'],
  ['Haftalık Satışlar', 'Haftalara göre sipariş sayıları, satış tutarları ve iade oranları.', 'Satışlar'],
  ['Aylık Satışlar', 'Aylık bazda sipariş sayıları, satış tutarları ve iade oranları.', 'Satışlar'],
  ['Ödeme Yöntemi Satış Raporu', 'Siparişlerin ödeme yöntemlerine göre dağılımı.', 'Satışlar'],
  ['Siparişlerin Kargo Firmalarına Göre Dağılımı', 'Siparişlerin kargo firmalarına göre dağılımı ve satış tutarları.', 'Satışlar'],
  ['Kritik Stok Seviyesindeki Ürünler', 'Kritik stok seviyesine ulaşan ürünlerin listesi.', 'Ürünler'],
  ['Üye Sipariş Raporu', 'Üyelerin sipariş sayıları ve satış tutarları.', 'Müşteriler'],
];

export default function Reports() {
 const [filters,setFilters]=useState<Filters>({dateFrom:calendarDate(29),dateTo:calendarDate(),currency:'TRY'});
 const [data,setData]=useState<Report|null>(null),[operations,setOperations]=useState<Operations|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[reportSearch,setReportSearch]=useState('');
 const requestId=useRef(0);
 async function load(snapshot:Filters) {
  if(!snapshot.dateFrom||!snapshot.dateTo||snapshot.dateFrom>snapshot.dateTo){setMessage('Geçerli Bir Başlangıç Ve Bitiş Tarihi Seçin.');return;}
  const id=++requestId.current;setBusy(true);setData(null);setOperations(null);setMessage('');
  try {const query=new URLSearchParams(snapshot);const [report,operation]=await Promise.all([api<Report>(`/admin/orders/report-summary?${query}`),api<Operations>(`/admin/orders/report-operations?${query}`)]);if(id===requestId.current){setData(report);setOperations(operation);}}
  catch(error){if(id===requestId.current)setMessage(error instanceof Error?error.message:'Rapor Yüklenemedi.');}
  finally{if(id===requestId.current)setBusy(false);}
 }
 useEffect(()=>{void load(filters);return ()=>{requestId.current++;};},[]);
 const money=(value:string)=>Number(value).toLocaleString('tr-TR',{style:'currency',currency:data?.currency??filters.currency});
 function exportReport(){if(!data)return;downloadXlsx(`trex-yonetim-${data.dateFrom}-${data.dateTo}-${data.currency}.xlsx`,'Yönetim Raporu',[
  ['Başlangıç',data.dateFrom],['Bitiş',data.dateTo],['Para Birimi',data.currency],[],['Dönem Özeti','Değer'],['Sipariş Sayısı',data.totals.order_count],['İptaller Hariç Sipariş Tutarı',Number(data.totals.revenue)],['Ortalama Sipariş Tutarı',Number(data.totals.average_order)],['Gerçekleşen Para Girişi',Number(data.financial.income)],['Gerçekleşen Para Çıkışı',Number(data.financial.expense)],['Net Nakit Hareketi',Number(data.financial.net)],[],
  ['Tarih','Sipariş Sayısı','İptaller Hariç Tutar'],...data.daily.map(r=>[r.label??'',r.count,Number(r.amount)]),[],['Satış Kanalı','Sipariş Sayısı','İptaller Hariç Tutar'],...data.channels.map(r=>[channel(r.sales_channel??''),r.count,Number(r.amount)]),[],['Sipariş Durumu','Sipariş Sayısı','Sipariş Tutarı'],...data.statuses.map(r=>[statusName(r.status??''),r.count,Number(r.amount)]),[],['Ürün','SKU','Adet','İptaller Hariç Tutar'],...data.topProducts.map(r=>[r.label??'',r.sku??'',r.count,Number(r.amount)])]);}
 const shownCatalog=reportCatalog.filter(([name,description,category])=>`${name} ${description} ${category}`.toLocaleLowerCase('tr-TR').includes(reportSearch.toLocaleLowerCase('tr-TR')));
 return <main><AdminNav/><section className={styles.page}>
  <h1>Yönetim Raporları</h1><p>Seçilen Para Birimindeki Siparişler Ve Gerçekleşen Para Hareketleri. Bekleyen Tahsilatlar Nakit Girişine Dahil Edilmez.</p>
  <form className="form-card dealer-toolbar" onSubmit={event=>{event.preventDefault();void load({...filters});}}>
   <label>Başlangıç Tarihi<input required type="date" value={filters.dateFrom} onChange={e=>setFilters(f=>({...f,dateFrom:e.target.value}))}/></label>
   <label>Bitiş Tarihi<input required type="date" value={filters.dateTo} onChange={e=>setFilters(f=>({...f,dateTo:e.target.value}))}/></label>
   <label>Para Birimi<select value={filters.currency} onChange={e=>setFilters(f=>({...f,currency:e.target.value}))}><option value="TRY">TRY — Türk Lirası</option><option value="USD">USD — Amerikan Doları</option><option value="EUR">EUR — Euro</option></select></label>
   <button disabled={busy}>{busy?'Rapor Yükleniyor…':'Raporu Getir'}</button><button type="button" disabled={busy||!data} onClick={exportReport}>Excel’e Aktar</button>
  </form>
  <div className="period-toolbar">{[7,30,90,365].map(days=><button key={days} disabled={busy} onClick={()=>{const snapshot={...filters,dateFrom:calendarDate(days-1),dateTo:calendarDate()};setFilters(snapshot);void load(snapshot);}}>Son {days} Gün</button>)}<Link href="/raporlar/ozel">Özel Rapor</Link><Link href="/finans/masraflar">Masraf Raporu</Link><Link href="/siparisler/havaleler">Havale Geçmişi</Link><Link href="/primler/yonetim">Prim Hakedişleri</Link></div>
  {message&&<p role="alert">{message}</p>}
  {data&&<><p role="status">Gösterilen Rapor: {data.dateFrom} — {data.dateTo} · {data.currency} · İstanbul Saatine Göre</p>
   <div className="cards">{[['Sipariş Sayısı',data.totals.order_count],['İptaller Hariç Sipariş Tutarı',money(data.totals.revenue)],['Ortalama Sipariş Tutarı',money(data.totals.average_order)],['Gerçekleşen Para Girişi',money(data.financial.income)],['Gerçekleşen Para Çıkışı',money(data.financial.expense)],['Net Nakit Hareketi',money(data.financial.net)]].map(([label,value])=><article key={label}><p>{label}</p><strong>{value}</strong></article>)}</div>
   <ReportTable title="Günlük Sipariş Özeti" headers={['Tarih','Sipariş Sayısı','İptaller Hariç Tutar']} rows={data.daily.map(r=>[r.label??'',r.count,money(r.amount)])}/>
   <ReportTable title="Satış Kanalları" headers={['Kanal','Sipariş Sayısı','İptaller Hariç Tutar']} rows={data.channels.map(r=>[channel(r.sales_channel??''),r.count,money(r.amount)])}/>
   <ReportTable title="Sipariş Durumları" headers={['Durum','Sipariş Sayısı','Sipariş Tutarı']} rows={data.statuses.map(r=>[statusName(r.status??''),r.count,money(r.amount)])}/>
   <ReportTable title="En Çok Satan 10 Ürün" headers={['Ürün','SKU','Adet','İptaller Hariç Tutar']} rows={data.topProducts.map(r=>[r.label??'',r.sku??'',r.count,money(r.amount)])}/>
  </>}
  {operations&&<ReportTable title="Dönem Operasyon Özeti — Tüm Para Birimleri" headers={['Açık İade','Tamamlanan İade','Aktif Kargo','Sorunlu Kargo','Vadesi Geçen Destek']} rows={[[operations.returns_open,operations.returns_refunded,operations.shipments_active,operations.shipments_failed,operations.support_overdue]]}/>}
  <section className={styles.catalog}><div className={styles.catalogHeader}><h2>Rapor Kataloğu</h2><label>Rapor Ara<input value={reportSearch} onChange={e=>setReportSearch(e.target.value)}/></label></div>
   <div className={styles.tableWrap}><table><thead><tr><th>Rapor Adı</th><th>Kategori</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>
    <tr><td>Detaylı Satış Raporu</td><td>Satışlar</td><td>Hazır</td><td><Link href="/raporlar/satis">Raporu Aç</Link></td></tr>
    {shownCatalog.map(([name,description,category])=>{const group=Object.entries(salesGroups).find(([,title])=>title===name)?.[0];const target=group?`/raporlar/satis?group=${group}`:name==='Stok Durum Raporu'?'/raporlar/envanter':name==='Kritik Stok Seviyesindeki Ürünler'?'/raporlar/envanter?critical=true':name==='Günlük Yeni Üye Kaydı'?'/raporlar/uyeler':null;return <tr key={name}><td><b>{name}</b><small>{description}</small></td><td>{category}</td><td>{target?'Hazır':'Geliştirme Bekliyor'}</td><td>{target?<Link href={target}>Raporu Aç</Link>:<button disabled>Henüz Hazır Değil</button>}</td></tr>;})}
   </tbody></table></div>
  </section>
 </section></main>;
}