'use client';
import Link from 'next/link';
import styles from './dashboard.module.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminNav } from './components/admin-nav';
import { api } from './lib/api';
import { MetricChart } from './components/metric-chart';
import { inDashboardPeriod, type DashboardPeriod } from './lib/dashboard-period';
import { dailySeries } from './lib/chart-data';
import { orderQueueStatus } from './lib/order-queue';
import { currencyTotals } from './lib/report-totals';
import { useRouter } from 'next/navigation';
type Dashboard={waiting:string;picking:string;packing:string;critical_stock:string;returns_pending:string};
type Order={id:string;order_number:string;status:string;total_amount:string;currency:string;created_at:string;customer_email:string|null;customer_name?:string|null;item_count:string;shipping_provider?:string|null;shipment_status?:string|null};
type Stock={id:string;name:string;warehouse_name:string;available_quantity:number};
type SupportSummary={open_count:string;urgent_count:string;overdue_count:string};
type Period=DashboardPeriod;
const money=(n:number,currency='TRY')=>n.toLocaleString('tr-TR',{style:'currency',currency});
const orderStatusLabels:Record<string,string>={"PENDING_PAYMENT":"Onay Bekliyor","PAID":"Onaylandı","PROCESSING":"Hazırlanıyor","REGISTERED":"Kargo Kaydı Hazır","SHIPPED":"Kargoya Verildi","DELIVERED":"Teslim Edildi","CANCELLED":"İptal Edildi","REFUNDED":"İade Edildi"};
const labels:Record<Period,string>={today:'Bugün',yesterday:'Dün',week:'Son 7 Gün',month:'Bu Ay',year:'Bu Yıl',all:'Tüm Zamanlar'};
export default function Admin(){
 const router=useRouter();
 const [chartCurrency,setChartCurrency]=useState('TRY');
 const [authenticated,setAuthenticated]=useState(false);
 const loadingLock=useRef(false);
 const [loading,setLoading]=useState(true);
 const [ordersAvailable,setOrdersAvailable]=useState(false);
 const [stockAvailable,setStockAvailable]=useState(false);
 const [data,setData]=useState<Dashboard|null>(null),[orders,setOrders]=useState<Order[]>([]),[stock,setStock]=useState<Stock[]>([]),[support,setSupport]=useState<SupportSummary|null>(null),[message,setMessage]=useState(''),[period,setPeriod]=useState<Period>('today'),[updatedAt,setUpdatedAt]=useState<string|null>(null);
 const load=async()=>{
  if(loadingLock.current)return;
  loadingLock.current=true;
  setLoading(true);
  setMessage('');
  try {
   const [dashboardResult,orderResult,stockResult,supportResult]=await Promise.allSettled([
    api<Dashboard>('/admin/warehouse/dashboard'),api<Order[]>('/admin/orders'),
    api<Stock[]>('/admin/warehouse/critical-stock'),api<SupportSummary>('/admin/support-tickets/summary'),
   ]);
   setData(dashboardResult.status==='fulfilled'?dashboardResult.value:null);
   setOrdersAvailable(orderResult.status==='fulfilled');
   setOrders(orderResult.status==='fulfilled'?orderResult.value:[]);
   setStockAvailable(stockResult.status==='fulfilled');
   setStock(stockResult.status==='fulfilled'?stockResult.value:[]);
   setSupport(supportResult.status==='fulfilled'?supportResult.value:null);
   const unavailable=[dashboardResult,orderResult,stockResult,supportResult]
    .flatMap((result,index)=>result.status==='rejected'?[['Operasyon Özeti','Siparişler','Kritik Stoklar','Müşteri Talepleri'][index]]:[]);
   setMessage(unavailable.length?unavailable.join(', ')+' Yüklenemedi. Yetkinizi Ve Bağlantınızı Kontrol Edip Yenileyin.':'');
   setUpdatedAt(new Date().toISOString());
  } finally { setLoading(false);loadingLock.current=false; }
 };
 useEffect(()=>{void api<{user:{role:string}}>('/auth/me').then(me=>{if(me.user.role==='DEALER')router.replace('/bayi-portal');else {setAuthenticated(true);load();}}).catch(()=>router.replace('/giris'));},[]);
 const filtered=useMemo(()=>orders.filter(order=>inDashboardPeriod(order.created_at,period)),[orders,period]);
 const sales=useMemo(()=>filtered.filter(order=>order.status!=='CANCELLED'&&order.currency===chartCurrency),[filtered,chartCurrency]);
 const revenue=useMemo(()=>Number(currencyTotals(sales.map(order=>({currency:order.currency,amount:order.total_amount})))[0]?.amount??0),[sales]);
 const chart=useMemo(()=>dailySeries(orders.filter(order=>order.status!=='CANCELLED').map(order=>({created_at:order.created_at,amount:order.total_amount,currency:order.currency})),chartCurrency),[orders,chartCurrency]);
 const statusSummary=useMemo(()=>[{label:'Onay bekliyor',value:orders.filter(order=>orderQueueStatus(order)==='PENDING_PAYMENT').length,href:'/siparisler?durum=PENDING_PAYMENT'},{label:'Hazırlanıyor',value:orders.filter(order=>orderQueueStatus(order)==='PROCESSING').length,href:'/siparisler?durum=PROCESSING'},{label:'Kargoda',value:orders.filter(order=>orderQueueStatus(order)==='SHIPPED').length,href:'/siparisler?durum=SHIPPED'},{label:'Teslim edildi',value:orders.filter(order=>orderQueueStatus(order)==='DELIVERED').length,href:'/siparisler?durum=DELIVERED'}],[orders]);
 const shippingSummary=useMemo(()=>Object.entries(orders.filter(order=>order.shipping_provider).reduce<Record<string,number>>((summary,order)=>{const provider=order.shipping_provider??'Diğer';summary[provider]=(summary[provider]??0)+1;return summary;},{})).sort(([,a],[,b])=>b-a).slice(0,4),[orders]);

 if(!authenticated)return <main aria-busy="true"><p role="status">Giriş Kontrol Ediliyor…</p></main>;
 return <main><AdminNav/><section className={`quka-dashboard ${styles.workspace}`}><div className="dashboard-heading"><h1>Ana Sayfa</h1><p>Satış, Sipariş Ve Stok Özeti</p></div><div className="period-toolbar"><div>{(Object.keys(labels) as Period[]).map(value=><button key={value} className={period===value?'selected':''} onClick={()=>setPeriod(value)}>{labels[value]}</button>)}</div>{updatedAt&&<small>Son güncelleme: {new Date(updatedAt).toLocaleTimeString('tr-TR')}</small>}<div className="chart-controls"><label>Para Birimi<select value={chartCurrency} onChange={e=>setChartCurrency(e.target.value)}>{[...new Set(['TRY',...orders.map(o=>o.currency)])].map(c=><option key={c} value={c}>{c}</option>)}</select></label></div><button type="button" disabled={loading} onClick={()=>void load()}>{loading?'Yükleniyor…':'Yenile'}</button></div>{message&&<p className="error">{message}</p>}<p className="dashboard-scope">Satış, Grafik Ve Sipariş Durumu Kartları Son 100 Siparişi Kapsar. Dönem Filtreleri Bu Kayıtlara Uygulanır. Tam Geçmiş İçin <Link href="/raporlar/satis">Satış Raporunu Aç</Link>.</p><div className={styles.grid}>
 <article className={`report-card order-card ${styles.orders}`}><header><span>SİPARİŞLER</span><Link href="/siparisler">Tüm siparişler →</Link></header><div className="order-numbers"><Link href="/siparisler?durum=PENDING_PAYMENT"><strong>{data?.waiting??'—'}<small>YENİ</small></strong></Link><Link href="/siparisler?durum=PROCESSING"><strong>{data?.picking??'—'}<small>TOPLANIYOR</small></strong></Link><Link href="/siparisler?durum=PROCESSING"><strong>{data?.packing??'—'}<small>PAKETLEME</small></strong></Link></div><p>Ödeme onayı tamamlanan siparişler, depoya göre hazırlama sırasına alınır.</p></article>
 <article className={`report-card performance-card ${styles.performance}`}><header><span>SATIŞ PERFORMANSI</span><Link href="/karlilik">Raporlar →</Link></header><strong>{ordersAvailable?money(revenue,chartCurrency):'—'}</strong><p>{labels[period]} Ciro · {chartCurrency} · İptaller Hariç</p><div className="performance-stats"><span><b>{ordersAvailable?sales.length:'—'}</b>Sipariş · {chartCurrency}</span><span><b>{ordersAvailable?money(sales.length?revenue/sales.length:0,chartCurrency):'—'}</b>Ortalama Sepet</span></div></article>
 <article className={`report-card funnel-card ${styles.operations}`}><header><span>OPERASYON ÖZETİ</span><Link href="/stok">Stok →</Link></header><div className="funnel"><Link href="/siparisler"><b>{ordersAvailable?filtered.length:'—'}</b><span>Siparişler</span></Link><Link href="/siparisler?durum=PENDING_PAYMENT"><b>{data?.waiting??'—'}</b><span>Hazırlanacak</span></Link><Link href="/siparisler?durum=PROCESSING"><b>{data?.picking??'—'}</b><span>Toplanıyor</span></Link><Link href="/siparisler?durum=PROCESSING"><b>{data?.packing??'—'}</b><span>Paketleme</span></Link></div></article>
 <div className={styles.chart}><MetricChart loading={loading&&!ordersAvailable} unavailable={!loading&&!ordersAvailable} title="Günlük Sipariş Tutarları" description="Son 7 Gün · İptal Edilen Siparişler Hariç · Hizmet Bedelleri Dahil" currency={chartCurrency} data={chart}/></div>
 <div className={styles.status}><MetricChart loading={loading&&!ordersAvailable} unavailable={!loading&&!ordersAvailable} title="Sipariş Durumları" description="Son 100 Sipariş · Tüm Para Birimleri" variant="ring" data={statusSummary.map(item=>({label:item.label,value:item.value}))}/></div>
 <article className={`report-card shipping-card ${styles.shipping}`}><header><span>KARGO FİRMALARI</span><Link href="/kargo">Kargo ekranı →</Link></header>{shippingSummary.length?<div className="shipping-summary">{shippingSummary.map(([provider,count])=><div key={provider}><span>{provider}</span><b>{count} gönderi</b></div>)}</div>:<p className="empty">{loading?'Yükleniyor…':!ordersAvailable?'Kargo Özeti Yüklenemedi.':'Henüz Kargo Kaydı Yok.'}</p>}</article>
 <article className={`report-card latest-card ${styles.latest}`}><header><span>SON SİPARİŞLER</span><Link href="/siparisler">Tümü →</Link></header>{filtered.length?<div className="dense-table">{filtered.slice(0,5).map(order=><Link href={`/siparisler/${order.id}`} key={order.id}><div><b>{order.order_number}</b><span>{order.customer_name??order.customer_email??'Misafir müşteri'} · {order.item_count} ürün</span></div><div><strong>{money(Number(order.total_amount),order.currency)}</strong><small>{orderStatusLabels[orderQueueStatus(order)]??order.status}</small></div></Link>)}</div>:<p className="empty">{!ordersAvailable?'Siparişler Yüklenemedi.':'Bu Zaman Aralığında Sipariş Yok.'}</p>}</article>
 <article className={`report-card stock-card ${styles.stock}`}><header><span>KRİTİK STOKLAR</span><Link href="/stok">Stok ekranı →</Link></header>{stock.length?<div className="dense-table">{stock.slice(0,5).map(item=><div key={`${item.id}-${item.warehouse_name}`}><div><b>{item.name}</b><span>{item.warehouse_name}</span></div><strong>{item.available_quantity} adet</strong></div>)}</div>:<p className="empty">{loading?'Yükleniyor…':!stockAvailable?'Stok Bilgileri Yüklenemedi.':'Kritik Stok Uyarısı Yok.'}</p>}</article>
 <article className={`report-card order-card ${styles.support}`}><header><span>MÜŞTERİ TALEPLERİ</span><Link href="/destek">Tüm talepler →</Link></header><div className="order-numbers"><strong>{support?.open_count??'—'}<small>AÇIK</small></strong><strong>{support?.urgent_count??'—'}<small>ÖNCELİKLİ</small></strong><strong>{support?.overdue_count??'—'}<small>24 SAATİ GEÇEN</small></strong></div><p>Açık talep ve geciken müşteri dönüşlerini buradan takip edin.</p></article>
 </div></section></main>;
}
