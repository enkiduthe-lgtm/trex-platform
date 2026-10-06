'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminNav } from './components/admin-nav';
import { api } from './lib/api';

type WarehouseDashboard={waiting:string;picking:string;packing:string;critical_stock:string;returns_pending:string};
type Order={id:string;order_number:string;status:string;total_amount:string;currency:string;created_at:string;customer_email:string|null;item_count:string};
type Stock={id:string;name:string;warehouse_name:string;available_quantity:number};
const money=(amount:string,currency:string)=>Number(amount).toLocaleString('tr-TR',{style:'currency',currency});

export default function Admin(){
  const [warehouse,setWarehouse]=useState<WarehouseDashboard|null>(null); const [orders,setOrders]=useState<Order[]>([]); const [critical,setCritical]=useState<Stock[]>([]); const [message,setMessage]=useState('');
  useEffect(()=>{Promise.all([api<WarehouseDashboard>('/admin/warehouse/dashboard'),api<Order[]>('/admin/orders'),api<Stock[]>('/admin/warehouse/critical-stock')]).then(([dashboard,orderRows,stockRows])=>{setWarehouse(dashboard);setOrders(orderRows);setCritical(stockRows);}).catch(error=>setMessage(error instanceof Error?error.message:'Veriler yüklenemedi'));},[]);
  const todayOrders=useMemo(()=>orders.filter(order=>new Date(order.created_at).toDateString()===new Date().toDateString()),[orders]);
  const todayRevenue=useMemo(()=>todayOrders.reduce((sum,order)=>sum+Number(order.total_amount),0),[todayOrders]);
  return <main><AdminNav/><section className="dashboard"><header className="dashboard-header"><div><p>OPERASYON MERKEZİ</p><h1>Genel bakış</h1><span>Satış, stok ve sipariş durumunu tek ekrandan takip edin.</span></div><div className="dashboard-actions"><Link href="/siparisler">Siparişleri aç</Link><Link className="primary-action" href="/urunler">Yeni ürün</Link></div></header>{message&&<p className="error" role="status">{message}</p>}
    <div className="metric-grid"><article><p>BUGÜNKÜ SİPARİŞ</p><strong>{todayOrders.length}</strong><span>Toplam {money(String(todayRevenue),'TRY')}</span></article><article><p>HAZIRLANACAK</p><strong>{warehouse?.waiting??'—'}</strong><span>Ödeme onayı tamamlanan siparişler</span></article><article><p>TOPLAMA / PAKETLEME</p><strong>{warehouse?Number(warehouse.picking)+Number(warehouse.packing):'—'}</strong><span>{warehouse?.picking??'—'} toplama · {warehouse?.packing??'—'} paketleme</span></article><article><p>KRİTİK STOK</p><strong>{warehouse?.critical_stock??'—'}</strong><span>Hızlı kontrol gerektiren ürünler</span></article></div>
    <div className="dashboard-columns"><article className="panel recent-orders"><div className="panel-heading"><div><p>SİPARİŞLER</p><h2>Son işlemler</h2></div><Link href="/siparisler">Tümünü gör →</Link></div>{orders.length?<div className="data-list">{orders.slice(0,6).map(order=><Link href="/siparisler" key={order.id} className="data-row"><div><strong>{order.order_number}</strong><span>{order.customer_email??'Misafir müşteri'} · {order.item_count} ürün</span></div><div><b>{money(order.total_amount,order.currency)}</b><small className={`status status-${order.status.toLowerCase()}`}>{order.status}</small></div></Link>)}</div>:<p className="empty-state">Henüz sipariş oluşmadı. Mağazadaki ilk satış burada görünecek.</p>}</article>
      <article className="panel quick-actions"><p>HIZLI İŞLEMLER</p><h2>Operasyonu hızlandır</h2><div><Link href="/urunler">Ürün ve fiyat yönetimi <span>→</span></Link><Link href="/stok">Stok kabulü ve depo <span>→</span></Link><Link href="/finans/havaleler">Havale onayları <span>→</span></Link><Link href="/musteriler">Müşteri kayıtları <span>→</span></Link></div></article></div>
    <article className="panel stock-panel"><div className="panel-heading"><div><p>STOK UYARILARI</p><h2>Kritik seviyedekiler</h2></div><Link href="/stok">Stok ekranı →</Link></div>{critical.length?<div className="stock-list">{critical.slice(0,5).map(item=><div key={`${item.id}-${item.warehouse_name}`}><strong>{item.name}</strong><span>{item.warehouse_name}</span><b>{item.available_quantity} adet</b></div>)}</div>:<p className="empty-state">Kritik stok uyarısı yok.</p>}</article>
  </section></main>;
}
