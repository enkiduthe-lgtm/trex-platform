'use client';
import { useEffect, useRef, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { downloadXlsx } from '../lib/xlsx';
import { financeDateTime } from '../lib/finance-report';
import { filterProfitability, profitabilityStatus, validateProfitability, ProfitabilityFilter, ProfitabilityRow } from '../lib/profitability-report';
import styles from './profitability.module.css';
const money=(value:string|null,currency:string|null)=>value===null||!currency?'—':Number(value).toLocaleString('tr-TR',{style:'currency',currency});
const raw=(value:string|null)=>value===null?'':Number(value);
const filters:[ProfitabilityFilter,string][]=[['ALL','Tüm Ürünler'],['NO_COST','Maliyeti Eksik'],['NO_PRICE','Satış Fiyatı Eksik'],['MIXED','Para Birimleri Farklı'],['LOSS','Birim Satışta Zarar'],['LOW_MARGIN','Marjı %0–20 Arasında'],['PROFITABLE','Marjı %20 Ve Üzeri']];
export default function ProfitabilityWorkspace(){
  const [rows,setRows]=useState<ProfitabilityRow[]>([]),[query,setQuery]=useState(''),[filter,setFilter]=useState<ProfitabilityFilter>('ALL');
  const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[error,setError]=useState(''),[loadedAt,setLoadedAt]=useState<string|null>(null);
  const alive=useRef(true),reading=useRef(false),readyRef=useRef(false);
  async function load(){
    if(!alive.current||reading.current)return false;
    reading.current=true;readyRef.current=false;setLoading(true);setReady(false);setError('');
    try{const value=validateProfitability(await api<unknown>('/admin/product-profitability'));if(!alive.current)return false;setRows(value);setLoadedAt(new Date().toISOString());setReady(true);readyRef.current=true;return true;}
    catch(reason){if(alive.current)setError(reason instanceof Error?reason.message:'Kârlılık kayıtları alınamadı.');return false;}
    finally{reading.current=false;if(alive.current)setLoading(false);}
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]);
  const shown=filterProfitability(rows,query,filter),comparable=shown.filter(row=>row.gross_profit!==null).length,losses=shown.filter(row=>row.gross_profit!==null&&Number(row.gross_profit)<0).length,missingCost=shown.filter(row=>row.unit_cost===null).length;
  function exportReport(){
    if(reading.current||!readyRef.current||!shown.length)return;
    downloadXlsx('trex-urun-karliligi.xlsx','Ürün Kârlılığı',[
      ['Kapsam','Geçerli tekli site satış fiyatı ve geçerli birim maliyet; gerçekleşen satış kârı değildir.'],['Veri Zamanı',loadedAt?financeDateTime(loadedAt):''],['Ürün Araması',query.trim()||'Tümü'],['Seçilen Görünüm',filters.find(([value])=>value===filter)?.[1]??filter],['Aktarılan Ürün',shown.length],[],
      ['Ürün','Satış Fiyatı','Satış Para Birimi','Birim Maliyet','Maliyet Para Birimi','Birim Brüt Kâr','Brüt Marj (%)','Durum'],
      ...shown.map(row=>[row.name,raw(row.sale_price),row.sale_currency??'',raw(row.unit_cost),row.cost_currency??'',raw(row.gross_profit),raw(row.gross_margin_percent),profitabilityStatus(row)]),
    ]);
  }
  return <main><AdminNav/><section className={styles.workspace}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>FİNANS / ÜRÜN KÂRLILIĞI</p><h1>Ürün Kârlılığı</h1><p>Geçerli tekli site fiyatını ürünün birim maliyetiyle karşılaştırın.</p></div><div className={styles.actions}><button type="button" disabled={loading} onClick={()=>void load()}>{loading?'Kayıtlar Yenileniyor…':'Kayıtları Yenile'}</button><button type="button" disabled={loading||!ready||!shown.length} onClick={exportReport}>Excel’e Aktar</button></div></header>
    <p className={styles.notice}>Brüt kâr aynı para birimindeki satış fiyatı ile maliyetin farkıdır. Kargo, prim, ödeme komisyonu ve kampanya giderleri dahil değildir. Farklı para birimleri çevrilmez.</p>
    {error&&<p className={styles.error} role="alert">{error} {loadedAt?'Son doğrulanan kayıtlar gösteriliyor; Excel aktarımı güncel bilgi alınana kadar kapalıdır.':'Güncel kayıtları almak için yeniden deneyin.'}</p>}
    <div className={styles.summary}>{[['Gösterilen Ürün',shown.length],['Karşılaştırılabilir',comparable],['Birim Satışta Zarar',losses],['Maliyeti Eksik',missingCost]].map(([label,count])=><div key={label}><span>{label}</span><strong>{ready?count:'Doğrulanmadı'}</strong></div>)}</div>
    <div className={styles.toolbar}><label>Ürün Ara<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Ürün adı"/></label><label>Kârlılık Görünümü<select value={filter} onChange={event=>setFilter(event.target.value as ProfitabilityFilter)}>{filters.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><p>Veri zamanı: {loadedAt?financeDateTime(loadedAt):'Henüz doğrulanmadı'}</p></div>
    <section className={styles.card} aria-busy={loading}><div className={styles.cardHeading}><h2>Birim Fiyat Ve Maliyet Tablosu</h2><span>{ready?`${shown.length} ürün`:'Güncel veri bekleniyor'}</span></div>
      <div className={styles.tableWrap}><table><caption>Ürün Bazında Kârlılık Karşılaştırması</caption><thead><tr><th>Ürün</th><th>Satış Fiyatı</th><th>Birim Maliyet</th><th>Birim Brüt Kâr</th><th>Brüt Marj</th><th>Durum</th></tr></thead><tbody>{shown.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td>{money(row.sale_price,row.sale_currency)}</td><td>{money(row.unit_cost,row.cost_currency)}</td><td className={row.gross_profit!==null&&Number(row.gross_profit)<0?styles.loss:''}>{money(row.gross_profit,row.sale_currency)}</td><td>{row.gross_margin_percent===null?'—':`%${Number(row.gross_margin_percent).toLocaleString('tr-TR',{maximumFractionDigits:2})}`}</td><td><span className={row.gross_profit!==null&&Number(row.gross_profit)<0?styles.lossBadge:styles.badge}>{profitabilityStatus(row)}</span>{row.sale_price!==null&&Number(row.sale_price)===0&&<small>Sıfır satış fiyatında marj hesaplanmaz.</small>}</td></tr>)}{!shown.length&&<tr><td colSpan={6}>{loading?'Kayıtlar yükleniyor…':!ready?'Güncel kârlılık bilgileri doğrulanmadı.':'Bu arama ve görünümde ürün bulunamadı.'}</td></tr>}</tbody></table></div>
    </section>
  </section></main>;
}
