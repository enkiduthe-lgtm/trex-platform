'use client';
import Link from 'next/link';
import styles from './dashboard.module.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminNav } from './components/admin-nav';
import { api } from './lib/api';
import { MetricChart } from './components/metric-chart';
import type { DashboardPeriod } from './lib/dashboard-period';
import { dailySeries } from './lib/chart-data';
import { useRouter } from 'next/navigation';
import { dashboardAccess } from './lib/dashboard-access';
import { DashboardOperations as Dashboard, DashboardStock as Stock, DashboardSupport as SupportSummary, DashboardSummary as OrderSummary, validateDashboardOperations, validateDashboardStock, validateDashboardSupport, validateDashboardSummary } from './lib/dashboard-data';
type Period=DashboardPeriod;
const money=(n:number,currency='TRY')=>n.toLocaleString('tr-TR',{style:'currency',currency});
const orderStatusLabels:Record<string,string>={"PENDING_PAYMENT":"Onay Bekliyor","PAID":"Onaylandı","PROCESSING":"Hazırlanıyor","REGISTERED":"Kargo Kaydı Hazır","SHIPPED":"Kargoya Verildi","DELIVERED":"Teslim Edildi","CARRIER_RETURN":"Aras İade Bildirdi","CANCELLED":"İptal Edildi","REFUNDED":"İade Edildi"};
const labels:Record<Period,string>={today:'Bugün',yesterday:'Dün',week:'Son 7 Gün',month:'Bu Ay',year:'Bu Yıl',all:'Tüm Zamanlar'};
export default function Admin(){
 const router=useRouter();
 const [chartCurrency,setChartCurrency]=useState('TRY');
 const [authenticated,setAuthenticated]=useState(false);
 const [role,setRole]=useState('');
 const [access,setAccess]=useState(()=>dashboardAccess(''));
 const loadingLock=useRef(false);
 const requestId=useRef(0);
 const [loading,setLoading]=useState(true);
 const [summary,setSummary]=useState<OrderSummary|null>(null);
 const [stockAvailable,setStockAvailable]=useState(false);
 const [data,setData]=useState<Dashboard|null>(null),[stock,setStock]=useState<Stock[]>([]),[support,setSupport]=useState<SupportSummary|null>(null),[message,setMessage]=useState(''),[period,setPeriod]=useState<Period>('today'),[updatedAt,setUpdatedAt]=useState<string|null>(null);
 const load=async(currentRole=role)=>{
  if(loadingLock.current)return;
  loadingLock.current=true;
  const id=++requestId.current;
  setLoading(true);
  setMessage('');
  try {
   const profile=currentRole==='ADMIN'
    ? await api<{configured:boolean;grants:string[]|null}>('/admin/access/me') : undefined;
   if(id!==requestId.current)return;
   const allowed=dashboardAccess(currentRole,profile);
   setAccess(allowed);
   const [dashboardResult,stockResult,supportResult,summaryResult]=await Promise.allSettled([
    allowed.stock?api<unknown>('/admin/warehouse/dashboard').then(validateDashboardOperations):Promise.resolve(null),
    allowed.stock?api<unknown>('/admin/warehouse/critical-stock').then(validateDashboardStock):Promise.resolve([]),
    allowed.support?api<unknown>('/admin/support-tickets/summary').then(validateDashboardSupport):Promise.resolve(null),
    allowed.orders?api<unknown>('/admin/orders/dashboard-summary').then(validateDashboardSummary):Promise.resolve(null),
   ]);
   if(id!==requestId.current)return;
   setData(dashboardResult.status==='fulfilled'?dashboardResult.value:null);
   setStockAvailable(stockResult.status==='fulfilled');
   setStock(stockResult.status==='fulfilled'?stockResult.value:[]);
   setSupport(supportResult.status==='fulfilled'?supportResult.value:null);
   setSummary(summaryResult.status==='fulfilled'?summaryResult.value:null);
   const unavailable=[dashboardResult,stockResult,supportResult,summaryResult]
    .flatMap((result,index)=>result.status==='rejected'?[['Operasyon Özeti','Kritik Stoklar','Müşteri Talepleri','Satış ve Sipariş Özeti'][index]]:[]);
   setMessage(unavailable.length?unavailable.join(', ')+' Yüklenemedi. Yetkinizi Ve Bağlantınızı Kontrol Edip Yenileyin.':'');
   const anyAvailable=(allowed.stock&&(dashboardResult.status==='fulfilled'||stockResult.status==='fulfilled'))||(allowed.support&&supportResult.status==='fulfilled')||(allowed.orders&&summaryResult.status==='fulfilled');
   setUpdatedAt(anyAvailable?new Date().toISOString():null);
  } catch(error) {
   if(id!==requestId.current)return;
   setAccess(dashboardAccess(''));
   setData(null);setStock([]);setSupport(null);setSummary(null);setUpdatedAt(null);
   setMessage(error instanceof Error?error.message:'Ana Sayfa Yetkileri Yüklenemedi.');
  } finally { if(id===requestId.current){setLoading(false);loadingLock.current=false;} }
 };
 useEffect(()=>{
  let cancelled=false;
  void api<{user:{role:string}}>('/auth/me').then(me=>{
   if(cancelled)return;
   if(me.user.role==='DEALER')router.replace('/bayi-portal');
   else {setRole(me.user.role);setAuthenticated(true);void load(me.user.role);}
  }).catch(()=>{if(!cancelled)router.replace('/giris');});
  return ()=>{cancelled=true;requestId.current++;loadingLock.current=false;};
 },[]);
 useEffect(()=>{
  if(!authenticated)return;
  const refresh=()=>{if(document.visibilityState==='visible')void load(role);};
  const timer=window.setInterval(refresh,60_000);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  return ()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[authenticated,role]);
 const recent=summary?.recent.filter(order=>order.period===period)??[];
 const selectedPeriod=summary?.periods.filter(row=>row.period===period)??[];
 const sales=selectedPeriod.find(row=>row.currency===chartCurrency);
 const salesCount=sales?.sales_count??0;
 const revenue=Number(sales?.amount??0);
 const totalOrders=selectedPeriod.reduce((sum,row)=>sum+row.total_count,0);
 const chart=useMemo(()=>dailySeries(summary?.trend??[],chartCurrency,new Date(summary?.generatedAt??Date.now())),[summary,chartCurrency]);
 const statusSummary=summary?.stages.map(row=>({label:orderStatusLabels[row.stage]??row.stage,value:row.count}))??[];
 const shippingSummary=summary?.carriers??[];

 if(!authenticated)return <main aria-busy="true"><p role="status">Giriş Kontrol Ediliyor…</p></main>;
 return <main><AdminNav/><section className={`quka-dashboard ${styles.workspace}`}><div className="dashboard-heading"><h1>Ana Sayfa</h1><p>Satış, Sipariş Ve Stok Özeti</p></div><div className="period-toolbar">{access.orders&&<div>{(Object.keys(labels) as Period[]).map(value=><button key={value} className={period===value?'selected':''} onClick={()=>setPeriod(value)}>{labels[value]}</button>)}</div>}{updatedAt&&<small>Son kontrol: {new Date(updatedAt).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</small>}{access.orders&&<div className="chart-controls"><label>Para Birimi<select value={chartCurrency} onChange={e=>setChartCurrency(e.target.value)}>{[...new Set(['TRY',...(summary?.periods ?? []).map(o=>o.currency)])].map(c=><option key={c} value={c}>{c}</option>)}</select></label></div>}<button type="button" disabled={loading} onClick={()=>void load()}>{loading?'Yükleniyor…':'Yenile'}</button></div>{message&&<p role="alert" className="error">{message}</p>}{access.orders&&<p className="dashboard-scope">Dönem seçimi satış özetini ve son siparişleri etkiler. Grafiklerin tarih aralıkları kendi başlıklarının altında gösterilir. Durum grafiği tüm kayıtları kapsar. Özetler ekran açıkken her dakika yenilenir. {access.reports&&<Link href="/raporlar/satis">Satış Raporunu Aç</Link>}</p>}{!loading&&!message&&!access.orders&&!access.stock&&!access.support&&<p className="notice">Ana sayfa özetleri için görüntüleme yetkisi tanımlanmamış. Yetkili olduğunuz bölümleri üst menüden açabilirsiniz.</p>}<div className={`${styles.grid} ${access.orders&&access.stock&&access.support&&access.shipping?'':styles.scopedGrid}`}>
 {access.stock && access.orders&&<article className={`report-card order-card ${styles.orders}`}><header><span>SİPARİŞLER</span><Link href="/siparisler">Tüm siparişler →</Link></header><div className="order-numbers"><Link href="/siparisler?durum=PAID"><strong>{data?.waiting??'—'}<small>ONAYLANDI</small></strong></Link><Link href="/siparisler?durum=PROCESSING"><strong>{data?.picking??'—'}<small>TOPLANIYOR</small></strong></Link><Link href="/siparisler?durum=PROCESSING"><strong>{data?.packing??'—'}<small>PAKETLEME</small></strong></Link></div><p>Ödeme onayı tamamlanan siparişler, depoya göre hazırlama sırasına alınır.</p></article>}
 {access.orders&&<article className={`report-card performance-card ${styles.performance}`}><header><span>SATIŞ PERFORMANSI</span>{access.reports&&<Link href="/karlilik">Raporlar →</Link>}</header><strong>{summary?money(revenue,chartCurrency):'—'}</strong><p>{labels[period]} Net Sipariş Tutarı · {chartCurrency}</p>{summary&&<small>Veri zamanı: {new Date(summary.generatedAt).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</small>}<div className="performance-stats"><span><b>{summary?salesCount:'—'}</b>Sipariş · {chartCurrency}</span><span><b>{summary?money(salesCount?revenue/salesCount:0,chartCurrency):'—'}</b>Ortalama Sepet</span></div></article>}
 {access.stock && access.orders&&<article className={`report-card funnel-card ${styles.operations}`}><header><span>OPERASYON ÖZETİ</span><Link href="/stok">Stok →</Link></header><div className="funnel"><Link href="/siparisler"><b>{summary?totalOrders:'—'}</b><span>Siparişler</span></Link><Link href="/siparisler?durum=PAID"><b>{data?.waiting??'—'}</b><span>Hazırlanacak</span></Link><Link href="/siparisler?durum=PROCESSING"><b>{data?.picking??'—'}</b><span>Toplanıyor</span></Link><Link href="/siparisler?durum=PROCESSING"><b>{data?.packing??'—'}</b><span>Paketleme</span></Link></div></article>}
 {access.orders&&<div className={styles.chart}><MetricChart loading={loading&&!summary} unavailable={!loading&&!summary} title="Günlük Sipariş Tutarları" description="Son 7 Gün · Net Sipariş Tutarı · Hizmet Bedelleri Dahil" currency={chartCurrency} data={chart}/></div>}
 {access.orders&&<div className={styles.status}><MetricChart loading={loading&&!summary} unavailable={!loading&&!summary} title="Sipariş Durumları" description="Tüm Siparişler · Tüm Para Birimleri" variant="ring" data={statusSummary.map(item=>({label:item.label,value:item.value}))}/></div>}
 {access.orders && access.shipping&&<article className={`report-card shipping-card ${styles.shipping}`}><header><span>KARGO FİRMALARI</span><Link href="/kargo">Kargo ekranı →</Link></header>{shippingSummary.length?<div className="shipping-summary">{shippingSummary.map(({provider,count})=><div key={provider}><span>{provider}</span><b>{count} gönderi</b></div>)}</div>:<p className="empty">{loading?'Yükleniyor…':!summary?'Kargo Özeti Yüklenemedi.':'Henüz Kargo Kaydı Yok.'}</p>}</article>}
 {access.orders&&<article className={`report-card latest-card ${styles.latest}`}><header><span>SON SİPARİŞLER</span><Link href="/siparisler">Tümü →</Link></header>{recent.length?<div className="dense-table">{recent.map(order=><Link href={`/siparisler/${order.id}`} key={order.id}><div><b>{order.order_number}</b><span>{order.customer_name??order.customer_email??'Misafir müşteri'} · {order.item_count} ürün</span></div><div><strong>{money(Number(order.total_amount),order.currency)}</strong><small>{orderStatusLabels[order.status]??order.status}</small></div></Link>)}</div>:<p className="empty">{loading?'Yükleniyor…':!summary?'Siparişler Yüklenemedi.':'Bu Zaman Aralığında Sipariş Yok.'}</p>}</article>}
 {access.stock&&<article className={`report-card stock-card ${styles.stock}`}><header><span>KRİTİK STOKLAR</span><Link href="/stok">Stok ekranı →</Link></header>{stock.length?<div className="dense-table">{stock.slice(0,5).map(item=><div key={`${item.id}-${item.warehouse_name}`}><div><b>{item.name}</b><span>{item.warehouse_name}</span></div><strong>{item.available_quantity} adet</strong></div>)}</div>:<p className="empty">{loading?'Yükleniyor…':!stockAvailable?'Stok Bilgileri Yüklenemedi.':'Kritik Stok Uyarısı Yok.'}</p>}</article>}
 {access.support&&<article className={`report-card order-card ${styles.support}`}><header><span>MÜŞTERİ TALEPLERİ</span><Link href="/destek">Tüm talepler →</Link></header><div className="order-numbers"><strong>{support?.open_count??'—'}<small>AÇIK</small></strong><strong>{support?.urgent_count??'—'}<small>ÖNCELİKLİ</small></strong><strong>{support?.overdue_count??'—'}<small>YANIT SÜRESİ GEÇEN</small></strong></div><p>Açık talep ve geciken müşteri dönüşlerini buradan takip edin.</p></article>}
 </div></section></main>;
}
