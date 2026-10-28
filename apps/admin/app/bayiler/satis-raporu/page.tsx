'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsx';

type DealerSale = { id:string; code:string; company_name:string; dealer_level_name:string|null; order_count:number; revenue:string; average_order:string; item_count:number };
type Report = { days:number; totals:{order_count:number;revenue:string}; dealers:DealerSale[] };
const money=(amount:string)=>Number(amount||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'});

export default function DealerSalesReport(){
  const [days,setDays]=useState(30); const [report,setReport]=useState<Report|null>(null); const [message,setMessage]=useState('');
  useEffect(()=>{setMessage('');void api<Report>(`/admin/dealers/sales-report?days=${days}`).then(setReport).catch(error=>setMessage(error instanceof Error?error.message:'Rapor yüklenemedi.'));},[days]);
  function exportReport(){if(!report)return;downloadXlsx(`bayi-satis-raporu-${days}-gun.xlsx`,'Bayi Satış Raporu',[['Dönem',`${days} Gün`],['Toplam Sipariş',String(report.totals.order_count)],['Toplam Ciro',report.totals.revenue],[],['Bayi','Bayi Kodu','Seviye','Sipariş','Ürün Adedi','Ortalama Sepet','Satış Cirosu'],...report.dealers.map(item=>[item.company_name,item.code,item.dealer_level_name??'Seviye Yok',String(item.order_count),String(item.item_count),item.average_order,item.revenue]),[],['Toplam','','',String(report.totals.order_count),'','',report.totals.revenue]]);}
  return <main><AdminNav/><section className="dealer-workspace"><p>BAYİLER / RAPORLAR</p><h1>Bayi Satış Raporu</h1><p>Yalnızca sistemde bayi siparişi olarak kaydedilmiş gerçek siparişleri gösterir.</p><div className="period-toolbar"><div>{[7,30,90,365].map(value=><button key={value} className={days===value?'selected':''} onClick={()=>setDays(value)}>Son {value} Gün</button>)}</div><div className="button-row"><Link className="secondary" href="/bayiler">Bayilere Dön</Link><button disabled={!report} onClick={exportReport}>Excel&apos;e Aktar</button></div></div>{message&&<p role="alert" className="notice">{message}</p>}
    <div className="cards dealer-summary-cards"><article><p>Sipariş</p><strong>{report?.totals.order_count??'—'}</strong><p>Seçili dönemdeki bayi siparişi</p></article><article><p>Satış Cirosu</p><strong>{report?money(report.totals.revenue):'—'}</strong><p>İptaller hariç toplam</p></article><article><p>Aktif Satış Yapan Bayi</p><strong>{report?.dealers.length??'—'}</strong><p>Seçili dönemde sipariş veren bayi</p></article></div>
    <section className="table-card"><p>Satış Dağılımı</p><h2>Bayi Bazlı Satışlar</h2><div className="table-wrap"><table><thead><tr><th>Bayi</th><th>Seviye</th><th>Sipariş</th><th>Ürün Adedi</th><th>Ortalama Sepet</th><th>Satış Cirosu</th></tr></thead><tbody>{report?.dealers.map(item=><tr key={item.id}><td><b>{item.company_name}</b><small>{item.code}</small></td><td>{item.dealer_level_name??'Seviye Yok'}</td><td>{item.order_count}</td><td>{item.item_count}</td><td>{money(item.average_order)}</td><td>{money(item.revenue)}</td></tr>)}</tbody></table>{report&&!report.dealers.length&&<p>Seçilen dönemde bayi siparişi bulunmuyor.</p>}</div></section>
  </section></main>;
}
