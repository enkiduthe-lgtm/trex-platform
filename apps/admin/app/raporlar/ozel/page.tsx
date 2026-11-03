'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsx';

type Product={label:string;sku:string;status:string;quantity:number;amount:string};
type Payment={label:string;status:string;quantity:number;amount:string};
type Collection={account_name:string;department:string;status:string;quantity:number;amount:string};
type Expense={kind:string;department:string;category:string;status:string;quantity:number;amount:string};
type Stock={product_name:string;sku:string;quantity:number};
type ChannelProduct={sales_channel:string;status:string;product_name:string;sku:string;quantity:number;amount:string};
type Commission={person:string;recipient_kind:string;sales_channel:string;product_name:string;sku:string;quantity:number;earned:string;reversed:string;amount:string};
type Data={dateFrom:string;dateTo:string;currency:string;stockAsOf:string;summary:Record<string,string|number>;products:Product[];payments:Payment[];collections:Collection[];expenses:Expense[];stock:Stock[];channelProducts:ChannelProduct[];commissions:Commission[]};
type Section={title:string;headers:string[];rows:(string|number)[][];moneyColumns:number[]};
const channels:Record<string,string>={PUBLIC_WEB:'Site Satışı',ADMIN_ORDER:'Yönetici Siparişi',RETAIL:'Perakende',WHOLESALE:'Toptan',DEALER_PORTAL:'Sistem Bayi',INSTAGRAM:'Instagram',MARKETPLACE:'Pazaryeri'};
const statuses:Record<string,string>={PENDING_PAYMENT:'Ödeme Bekliyor',PENDING:'Bekliyor',PAID:'Ödendi',PROCESSING:'Hazırlanıyor',SHIPPED:'Kargoda',DELIVERED:'Teslim Edildi',CANCELLED:'İptal Edildi',REFUNDED:'İade Edildi',SUCCEEDED:'Ödendi',FAILED:'Başarısız',COLLECTION_PENDING:'Tahsilat Bekliyor',PARTIALLY_PAID:'Kısmen Ödendi',OVERDUE:'Gecikmiş'};
const kinds:Record<string,string>={EXPENSE:'Masraf',REFUND:'İade Ödemesi',COMMISSION:'Komisyon Gideri',PRIME_EXPENSE:'Prim Ödemesi'};
const roles:Record<string,string>={EXECUTIVE:'Yönetici',DIRECTOR:'Müdür',STAFF:'Personel',MANAGER:'Diğer Yönetici'};
const summaryLabels=[['incoming_transfers','Gerçekleşen Gelen Havale'],['expenses','Gerçekleşen Para Çıkışı'],['sales','İptaller Hariç Sipariş Tutarı'],['units_sold','İptaller Hariç Ürün Adedi'],['executive_commission','Yönetici Net Hakedişi'],['director_commission','Müdür Net Hakedişi'],['staff_commission','Personel Net Hakedişi'],['manager_commission','Diğer Yönetici Net Hakedişi'],['commission_total','Toplam Net Prim Yükü']];
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function sections(data:Data):Section[]{return [
 {title:'Ürün Ve Sipariş Durumu Özeti',headers:['Ürün','SKU','Durum','Adet','Sipariş Tutarı'],rows:data.products.map(r=>[r.label,r.sku,statuses[r.status]??r.status,r.quantity,Number(r.amount)]),moneyColumns:[4]},
 {title:'Sipariş Tarihine Göre Ödeme Hareketleri',headers:['Ödeme Türü','Durum','İşlem Sayısı','Tutar'],rows:data.payments.map(r=>[({bank_transfer:'Havale / EFT',paytr:'PayTR',cash:'Elden Nakit',cash_on_delivery_card:'Kapıda Kart',cash_on_delivery_cash:'Kapıda Nakit',dealer_commission:'Bayi Prim Bakiyesi'} as Record<string,string>)[r.label]??r.label,statuses[r.status]??r.status,r.quantity,Number(r.amount)]),moneyColumns:[3]},
 {title:'Gelen Havale — Banka Hesabı Ve Departman',headers:['Hesap','Departman','Durum','İşlem Sayısı','Tutar'],rows:data.collections.map(r=>[r.account_name,r.department,statuses[r.status]??r.status,r.quantity,Number(r.amount)]),moneyColumns:[4]},
 {title:'Gider Ve İade Hareketleri',headers:['Tür','Departman','Kategori','Durum','İşlem Sayısı','Tutar'],rows:data.expenses.map(r=>[kinds[r.kind]??r.kind,r.department,r.category,statuses[r.status]??r.status,r.quantity,Number(r.amount)]),moneyColumns:[5]},
 {title:'Güncel Kullanılabilir Stok — Tarih Filtresinden Bağımsız',headers:['Ürün','SKU','Kullanılabilir Adet'],rows:data.stock.map(r=>[r.product_name,r.sku,r.quantity]),moneyColumns:[]},
 {title:'Kanal Ve Ürün Performansı',headers:['Kanal','Ürün','SKU','Durum','Adet','Sipariş Tutarı'],rows:data.channelProducts.map(r=>[channels[r.sales_channel]??r.sales_channel,r.product_name,r.sku,statuses[r.status]??r.status,r.quantity,Number(r.amount)]),moneyColumns:[5]},
 {title:'Kişi Bazında Kazanılan Prim, Kesinti Ve Net Hakediş',headers:['Kişi','Görev','Kanal','Ürün','SKU','Prim Hesaplanan Adet','Kazanılan','Kesinti','Net Hakediş'],rows:data.commissions.map(r=>[r.person,roles[r.recipient_kind]??r.recipient_kind,channels[r.sales_channel]??r.sales_channel,r.product_name,r.sku,r.quantity,Number(r.earned),Number(r.reversed),Number(r.amount)]),moneyColumns:[6,7,8]}
];}
export default function SpecialReport(){
 const [filters,setFilters]=useState(()=>({dateFrom:today().slice(0,7)+'-01',dateTo:today(),currency:'TRY'}));
 const [data,setData]=useState<Data|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const requestId=useRef(0);
 async function load(snapshot:typeof filters){if(!snapshot.dateFrom||!snapshot.dateTo||snapshot.dateFrom>snapshot.dateTo){setMessage('Geçerli Bir Başlangıç Ve Bitiş Tarihi Seçin.');return;}const id=++requestId.current;setBusy(true);setData(null);setMessage('');try{const result=await api<Data>(`/admin/orders/special-report?${new URLSearchParams(snapshot)}`);if(id===requestId.current)setData(result);}catch(error){if(id===requestId.current)setMessage(error instanceof Error?error.message:'Özel Rapor Yüklenemedi.');}finally{if(id===requestId.current)setBusy(false);}}
 useEffect(()=>{void load(filters);return ()=>{requestId.current++;};},[]);
 const money=(value:string|number)=>Number(value).toLocaleString('tr-TR',{style:'currency',currency:data?.currency??filters.currency});
 const reportSections=data?sections(data):[];
 function exportReport(){if(!data)return;const rows:(string|number)[][]=[['Başlangıç',data.dateFrom],['Bitiş',data.dateTo],['Para Birimi',data.currency],['Stok Bilgisi Alınma Zamanı',new Date(data.stockAsOf).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})],['Not','Sipariş Ve Ödeme Özeti Sipariş Tarihine; Havale, Gider Ve Prim Özeti Hareket Tarihine Göredir. Stok Günceldir.'],[],['Özet','Değer'],...summaryLabels.map(([key,label])=>[label,Number(data.summary[key]??0)])];for(const section of reportSections)rows.push([], [section.title],section.headers,...section.rows);downloadXlsx(`trex-ozel-${data.dateFrom}-${data.dateTo}-${data.currency}.xlsx`,'Özel Rapor',rows);}
 return <main><AdminNav/><section className="finance-workspace"><h1>Özel Rapor</h1><p>Sipariş Ve Ödeme Özetleri Sipariş Tarihine; Havale, Gider Ve Prim Özetleri Hareket Tarihine Göre Hesaplanır. Para Birimleri Birbirine Çevrilmez.</p>
  <nav className="finance-nav"><Link href="/raporlar">Rapor Merkezi</Link><Link href="/raporlar/satis">Satış Raporu</Link><Link href="/finans/mutabakat">Finans Mutabakatı</Link></nav>
  <form className="form-card dealer-toolbar" onSubmit={event=>{event.preventDefault();void load({...filters});}}><label>Başlangıç Tarihi<input required type="date" value={filters.dateFrom} onChange={e=>setFilters(f=>({...f,dateFrom:e.target.value}))}/></label><label>Bitiş Tarihi<input required type="date" value={filters.dateTo} onChange={e=>setFilters(f=>({...f,dateTo:e.target.value}))}/></label><label>Para Birimi<select value={filters.currency} onChange={e=>setFilters(f=>({...f,currency:e.target.value}))}><option value="TRY">TRY — Türk Lirası</option><option value="USD">USD — Amerikan Doları</option><option value="EUR">EUR — Euro</option></select></label><div className="button-row"><button disabled={busy}>{busy?'Rapor Yükleniyor…':'Raporu Getir'}</button><button type="button" disabled={busy||!data} onClick={exportReport}>Excel’e Aktar</button></div></form>
  {message&&<p role="alert" className="notice">{message}</p>}
  {data&&<><p role="status">Gösterilen Dönem: {data.dateFrom} — {data.dateTo} · {data.currency} · İstanbul Saati</p><div className="cards">{summaryLabels.map(([key,label])=><article key={key}><p>{label}</p><strong>{key==='units_sold'?data.summary[key]:money(data.summary[key]??0)}</strong></article>)}</div>
   <p>Stok Bilgisi Alınma Zamanı: {new Date(data.stockAsOf).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}. Geçmiş Tarihin Stok Bakiyesi Değildir. Prim Kesintileri Eksi Tutarla Gösterilir.</p>
   {reportSections.map(section=><section className="table-card" key={section.title}><h2>{section.title}</h2><div className="table-wrap"><table><thead><tr>{section.headers.map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{section.rows.map((row,index)=><tr key={index}>{row.map((value,column)=><td key={column}>{section.moneyColumns.includes(column)?money(value):value}</td>)}</tr>)}</tbody></table>{!section.rows.length&&<p className="empty-state">Bu Dönemde Kayıt Yok.</p>}</div></section>)}
  </>}
 </section></main>;
}