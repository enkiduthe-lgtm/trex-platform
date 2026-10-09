'use client';
import { FormEvent, useEffect, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { PickOperations } from './pick-operations';

type Dashboard={waiting:string;picking:string;packing:string;critical_stock:string;returns_pending:string};
type Pick={id:string;order_number:string;status:string;warehouse_name:string;assigned_email:string|null;expected_items:string;picked_items:string};
type PickQueue={id:string;order_number:string;warehouse_name:string;item_count:string};
type Product={id:string;name:string;sku:string};
type Location={id:string;code:string;name:string;is_active:boolean};
type Stock={product_id:string;warehouse_id:string;product_name:string;sku:string;warehouse_name:string;physical_quantity:number;reserved_quantity:number;available_quantity:number};

export default function Inventory(){
  const [deleting,setDeleting]=useState(false);
  async function removeStock(item:Stock){
    if(!window.confirm(`${item.product_name} — ${item.warehouse_name} stoğunun tamamı silinsin mi? Stok hareket geçmişi korunur.`)) return;
    setDeleting(true);
    try{await api(`/admin/warehouse/stock/${item.warehouse_id}/${item.product_id}`,{method:'DELETE'});setMessage('Stok silindi.');await load();}catch(e){setMessage(e instanceof Error?e.message:'Stok silinemedi');}finally{setDeleting(false);}
  }
  async function removeLocation(item:Location){
    if(!window.confirm(`${item.name} deposu kalıcı silinsin mi? Önce depodaki stokları silmelisiniz.`)) return;
    setDeleting(true);
    try{await api(`/admin/warehouse/locations/${item.id}`,{method:'DELETE'});setReceipt(x=>({...x,warehouseId:x.warehouseId===item.id?'':x.warehouseId}));setMessage('Depo silindi.');await load();}catch(e){setMessage(e instanceof Error?e.message:'Depo silinemedi');}finally{setDeleting(false);}
  }
  const [dashboard,setDashboard]=useState<Dashboard|null>(null); const [picks,setPicks]=useState<Pick[]>([]); const [queue,setQueue]=useState<PickQueue[]>([]); const [stock,setStock]=useState<Stock[]>([]); const [products,setProducts]=useState<Product[]>([]); const [locations,setLocations]=useState<Location[]>([]); const [message,setMessage]=useState('');
  const [location,setLocation]=useState({code:'',name:''});
  const [receipt,setReceipt]=useState({productId:'',warehouseId:'',quantity:'',lotCode:'',expiryDate:'',locationCode:'',note:''});
  const load=()=>Promise.all([api<Dashboard>('/admin/warehouse/dashboard'),api<Pick[]>('/admin/warehouse/picks'),api<PickQueue[]>('/admin/warehouse/picks/queue'),api<Stock[]>('/admin/warehouse/stock'),api<Product[]>('/admin/products'),api<Location[]>('/admin/warehouse/locations')]).then(([d,p,q,s,productRows,locationRows])=>{setDashboard(d);setPicks(p);setQueue(q);setStock(s);setProducts(productRows);setLocations(locationRows);}).catch(e=>setMessage(e.message));
  useEffect(()=>{void load();},[]);
  async function createLocation(event:FormEvent){event.preventDefault();try{await api('/admin/warehouse/locations',{method:'POST',body:JSON.stringify(location)});setLocation({code:'',name:''});setMessage('Depo kaydedildi.');void load();}catch(e){setMessage(e instanceof Error?e.message:'Depo kaydedilemedi');}}
  async function receiveStock(event:FormEvent){event.preventDefault();try{await api('/admin/warehouse/receipts',{method:'POST',body:JSON.stringify({...receipt,quantity:Number(receipt.quantity),expiryDate:receipt.expiryDate||undefined,locationCode:receipt.locationCode||undefined,note:receipt.note||undefined})});setReceipt(x=>({...x,quantity:'',lotCode:'',expiryDate:'',locationCode:'',note:''}));setMessage('Stok girişi kaydedildi. Ürün artık sipariş için kullanılabilir.');void load();}catch(e){setMessage(e instanceof Error?e.message:'Stok girişi kaydedilemedi');}}
  async function startPick(item:PickQueue){try{const pick=await api<{id:string;replayed?:boolean}>(`/admin/warehouse/picks/queue/${item.id}`,{method:'POST'});setMessage(`${item.order_number} için toplama listesi açıldı: ${pick.id}`);await load();}catch(e){setMessage(e instanceof Error?e.message:'Toplama listesi açılamadı');}}
  return <main><AdminNav/><section><p>STOK VE DEPO</p><h1>Depo operasyonu</h1><p>Stok kabulü, lot/SKT takibi, toplama ve paketleme işlemlerini buradan yönetin.</p>{message&&<p role="status">{message}</p>}
    {dashboard&&<div className="cards"><article><p>HAZIRLANMAYI BEKLEYEN</p><h2>{dashboard.waiting}</h2></article><article><p>TOPLANIYOR</p><h2>{dashboard.picking}</h2></article><article><p>PAKETLEME BEKLEYEN</p><h2>{dashboard.packing}</h2></article><article><p>KRİTİK STOK</p><h2>{dashboard.critical_stock}</h2></article><article><p>BEKLEYEN İADE</p><h2>{dashboard.returns_pending}</h2></article></div>}
    <div className="two-columns"><form className="form-card" onSubmit={createLocation}><h2>Depo ekle</h2><label>Depo kodu<input required placeholder="IST-ANA" value={location.code} onChange={e=>setLocation(x=>({...x,code:e.target.value}))}/></label><label>Depo adı<input required placeholder="İstanbul Ana Depo" value={location.name} onChange={e=>setLocation(x=>({...x,name:e.target.value}))}/></label><button>Depoyu kaydet</button><p>{locations.length?`${locations.length} depo tanımlı.`:'Önce aktif bir depo ekleyin.'}</p></form>
      <form className="form-card" onSubmit={receiveStock}><h2>Stok girişi</h2><label>Ürün<select required value={receipt.productId} onChange={e=>setReceipt(x=>({...x,productId:e.target.value}))}><option value="">Ürün seç</option>{products.map(product=><option value={product.id} key={product.id}>{product.name} · {product.sku}</option>)}</select></label><label>Depo<select required value={receipt.warehouseId} onChange={e=>setReceipt(x=>({...x,warehouseId:e.target.value}))}><option value="">Depo seç</option>{locations.filter(location=>location.is_active).map(location=><option value={location.id} key={location.id}>{location.name} · {location.code}</option>)}</select></label><label>Adet<input required min="1" step="1" type="number" value={receipt.quantity} onChange={e=>setReceipt(x=>({...x,quantity:e.target.value}))}/></label><label>Lot kodu<input required placeholder="LOT-2026-001" value={receipt.lotCode} onChange={e=>setReceipt(x=>({...x,lotCode:e.target.value}))}/></label><label>Son kullanma tarihi <small>(isteğe bağlı)</small><input type="date" value={receipt.expiryDate} onChange={e=>setReceipt(x=>({...x,expiryDate:e.target.value}))}/></label><label>Raf/lokasyon <small>(isteğe bağlı)</small><input placeholder="A-01-03" value={receipt.locationCode} onChange={e=>setReceipt(x=>({...x,locationCode:e.target.value}))}/></label><label>Not <small>(isteğe bağlı)</small><input value={receipt.note} onChange={e=>setReceipt(x=>({...x,note:e.target.value}))}/></label><button>Stoğu kaydet</button></form></div>
    <h2 id="stok-silme">Mevcut stok / Stok silme</h2><div className="cards">{stock.length?stock.map(item=><article key={`${item.product_id}-${item.warehouse_id}`}><p>{item.warehouse_name}</p><h2>{item.product_name}</h2><p>Kullanılabilir: {item.available_quantity} · Fiziksel: {item.physical_quantity} · Rezerve: {item.reserved_quantity}</p><button type="button" disabled={deleting||item.reserved_quantity>0} onClick={()=>void removeStock(item)}>Stoğu sil</button></article>):<article><p>Henüz stok girişi yok.</p></article>}</div>
    <h2 id="depo-silme">Depolar / Depo silme</h2><p>Depoyu silmek için önce stoklarını silin. Sipariş geçmişine bağlı depolar korunur.</p><div className="cards">{locations.map(item=><article key={item.id}><h3>{item.name}</h3><p>{item.code} · {item.is_active?'Aktif':'Pasif'}</p><button type="button" disabled={deleting} onClick={()=>void removeLocation(item)}>Depoyu sil</button></article>)}</div>
    <h2>Hazırlama kuyruğu</h2><p>Ödemesi onaylanan siparişleri buradan toplama operasyonuna başlatın.</p><div className="cards">{queue.length?queue.map(item=><article key={item.id}><p>{item.warehouse_name}</p><h2>{item.order_number}</h2><p>{item.item_count} ürün kalemi</p><button type="button" onClick={()=>void startPick(item)}>Toplamayı başlat</button></article>):<article><p>Hazırlama bekleyen sipariş yok.</p></article>}</div>
    <h2>Toplama listeleri</h2><div className="cards">{picks.length?picks.map(p=><article key={p.id}><p>{p.status} · {p.warehouse_name}</p><h2>{p.order_number}</h2><p>{p.picked_items}/{p.expected_items} ürün · {p.assigned_email??'Atanmadı'}</p><details><summary>Toplama listesi kimliği</summary><code>{p.id}</code></details></article>):<article><p>Henüz oluşturulmuş toplama listesi yok.</p></article>}</div><PickOperations/>
    <article><h2>FEFO kuralı</h2><p>Son kullanma tarihi girilen lotlarda sistem, SKT’si en yakın olan lotu önce toplama için önerir.</p></article>
  </section></main>;
}
