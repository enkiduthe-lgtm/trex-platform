'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { effectiveDealerPrice, DealerPrice } from '../lib/dealer-prices';
import styles from './level-prices.module.css';

type Level = { id: string; name: string; sort_order: number };
type Product = { id: string; name: string };
const sizes = [1,2,3,5] as const;
const money=(price:DealerPrice)=>Number(price.amount).toLocaleString('tr-TR',{style:'currency',currency:price.currency});
export function LevelEditor({ levels, onSaved }: { levels: Level[]; onSaved: () => void }) {
  const [name,setName]=useState('');
  const [names,setNames]=useState<Record<string,string>>({});
  const [amounts,setAmounts]=useState<Record<string,string>>({});
  const [products,setProducts]=useState<Product[]>([]);
  const [prices,setPrices]=useState<DealerPrice[]>([]);
  const [productId,setProductId]=useState('');
  const [canPrice,setCanPrice]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  async function refresh(){
    const [products,prices,me]=await Promise.all([api<Product[]>('/admin/products'),api<DealerPrice[]>('/admin/prices'),api<{user:{role:string}}>('/auth/me')]);
    setProducts(products);setPrices(prices);setCanPrice(me.user.role==='SUPER_ADMIN');
  }
  useEffect(()=>{void refresh().catch(e=>setMessage(e instanceof Error?e.message:'Fiyatlar Yüklenemedi.')).finally(()=>setLoading(false));},[]);
  async function perform(work:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{await work();}catch(e){setMessage(e instanceof Error?e.message:'Kaydedilemedi.');}finally{setBusy(false);}}
  async function create(event:FormEvent){event.preventDefault();await perform(async()=>{const sortOrder=[1,2,3].find(value=>!levels.some(level=>level.sort_order===value));if(!sortOrder)throw new Error('En Fazla Üç Seviye Tanımlanabilir.');await api('/admin/dealers/levels',{method:'POST',body:JSON.stringify({code:`LV_${crypto.randomUUID().replaceAll('-','').toUpperCase()}`,name:name.trim(),sortOrder})});setName('');onSaved();setMessage('Seviye Kaydedildi.');});}
  const shownProducts=products.filter(product=>!productId||product.id===productId);
  return <section id="seviyeler" className={`table-card dealer-level-editor ${styles.root}`}>
    <header className={styles.toolbar}><div><h2>Bayi Seviyeleri Ve Ürün Fiyatları</h2><p>Ürünlerde Kaydettiğiniz Güncel Seviye Fiyatları Burada Gösterilir. Çoklu Alım Fiyatları Paketin Toplamıdır.</p></div><button type="button" className="secondary" disabled={busy||loading} onClick={()=>void perform(refresh)}>Fiyatları Yenile</button></header>
    {message&&<p role="status" className="notice">{message}</p>}
    {canPrice&&<form className="dealer-toolbar" onSubmit={create}><label>Yeni Seviye Adı<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy||levels.length>=3}>Seviye Ekle</button></form>}
    <div className="table-wrap"><table className={styles.names}><thead><tr><th>Seviye Adı</th><th>Düzenleme</th></tr></thead><tbody>{levels.map(level=><tr key={level.id}><td><input aria-label={`${level.name} Seviye Adı`} maxLength={120} disabled={busy||!canPrice} value={names[level.id]??level.name} onChange={e=>setNames(current=>({...current,[level.id]:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}} onBlur={()=>{const next=(names[level.id]??level.name).trim();if(!next||next===level.name||busy||!canPrice)return;void perform(async()=>{await api(`/admin/dealers/levels/${level.id}`,{method:'PATCH',body:JSON.stringify({name:next})});onSaved();setMessage('Seviye Adı Güncellendi.');});}}/></td><td>{canPrice?'İsme Tıklayıp Düzenleyin. Enter İle Kaydedilir.':'Yalnız Görüntüleme'}</td></tr>)}</tbody></table></div>
    <label>Ürün Filtresi<select value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Tüm Ürünler</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    {loading?<p role="status">Kayıtlı Fiyatlar Yükleniyor…</p>:<div className="table-wrap"><table className={styles.priceTable}><thead><tr><th>Ürün</th><th>Bayi Seviyesi</th><th>Tekli Fiyat</th><th>2’li Toplam</th><th>3’lü Toplam</th><th>5’li Toplam</th></tr></thead><tbody>{shownProducts.flatMap(product=>levels.map(level=><tr key={`${product.id}:${level.id}`}><td><b>{product.name}</b></td><td>{names[level.id]??level.name}</td>{sizes.map(size=>{
      const key=`${product.id}:${level.id}:${size}`;
      const current=effectiveDealerPrice(prices,product.id,level.id,size);
      const draft=amounts[key]??'';
      const valid=draft!==''&&Number.isFinite(Number(draft))&&Number(draft)>=0&&Number(draft)<=9999999999.99&&/^\d+(\.\d{1,2})?$/.test(draft);
      return <td key={size}><div className={styles.priceCell}><strong>{current?money(current):'Tanımlanmamış'}</strong>{canPrice&&<><input aria-label={`${product.name} ${level.name} ${size===1?'Tekli':`${size}’li Toplam`} Fiyatı`} type="number" min="0" max="9999999999.99" step="0.01" disabled={busy} value={draft} placeholder={current?.amount??'Yeni Fiyat'} onChange={e=>setAmounts(values=>({...values,[key]:e.target.value}))}/><button type="button" disabled={busy||!valid} onClick={()=>void perform(async()=>{await api('/admin/prices',{method:'POST',body:JSON.stringify({productId:product.id,scope:'DEALER_LEVEL',dealerLevelId:level.id,packSize:size,amount:Number(draft),currency:'TRY'})});setAmounts(values=>({...values,[key]:''}));await refresh();setMessage('Seviye Fiyatı Kaydedildi. Geçmiş Siparişler Değişmedi.');})}>Fiyatı Kaydet</button></>}</div></td>;
    })}</tr>))}</tbody></table>{!shownProducts.length&&<p className="empty-state">Gösterilecek Ürün Bulunamadı.</p>}{!levels.length&&<p className="empty-state">Önce Bayi Seviyesi Ekleyin.</p>}</div>}
    {!canPrice&&!loading&&<p>Fiyat Kaydetmek İçin Müdür Yetkisi Gereklidir.</p>}
  </section>;
}
