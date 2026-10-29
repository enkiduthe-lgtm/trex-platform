'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
type Level = { id: string; name: string; sort_order: number };
type Price = { id: string; product_id: string; dealer_level_id: string | null; scope: string; amount: string; starts_at: string; ends_at: string | null; currency: string };
export function LevelEditor({ levels, onSaved }: { levels: Level[]; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [productId, setProductId] = useState('');
  const [canPrice, setCanPrice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function refresh() {
    const [products, prices, me] = await Promise.all([api<{id:string;name:string}[]>('/admin/products'), api<Price[]>('/admin/prices'), api<{user:{role:string}}>('/auth/me')]);
    setProducts(products); setPrices(prices); setCanPrice(me.user.role === 'SUPER_ADMIN');
  }
  useEffect(() => { void refresh().catch(error => setMessage(error instanceof Error ? error.message : 'Veriler Yüklenemedi.')); }, []);
  async function perform(work: () => Promise<void>) { setBusy(true); setMessage(''); try { await work(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Kaydedilemedi.'); } finally { setBusy(false); } }
  async function create(event: FormEvent) {
    event.preventDefault();
    await perform(async () => { const sortOrder = [1,2,3,4].find(value => !levels.some(level => level.sort_order === value)); if (!sortOrder) throw new Error('En Fazla Dört Seviye Tanımlanabilir.'); await api('/admin/dealers/levels', { method:'POST', body:JSON.stringify({ code:`LV_${crypto.randomUUID().replaceAll('-','').toUpperCase()}`, name:name.trim(), sortOrder }) }); setName(''); onSaved(); setMessage('Seviye Kaydedildi.'); });
  }
  return <section id="seviyeler" className="table-card"><h2>Bayi Seviyeleri Ve Ürün Fiyatları</h2><p>Seviye Adını Buradan Düzenleyin. Ürün Seçerek Her Seviyenin Fiyatını Girin. Bayi Tablosundan Seviye Atayabilirsiniz.</p>{message && <p role="status" className="notice">{message}</p>}<form className="dealer-toolbar" onSubmit={create}><label>Yeni Seviye Adı<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label><button disabled={busy || levels.length >= 4}>Seviye Ekle</button></form><label>Fiyatı Düzenlenecek Ürün<select value={productId} onChange={e=>{setProductId(e.target.value);setAmounts({});}}><option value="">Ürün Seçin</option>{products.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><div className="table-wrap"><table><thead><tr><th>Seviye Adı</th><th>Ad İşlemi</th><th>Geçerli Ürün Fiyatı</th><th>Yeni Fiyat (TL)</th><th>Fiyat İşlemi</th></tr></thead><tbody>{levels.map(level=>{
    const current = prices.find(row=>row.product_id===productId && row.dealer_level_id===level.id && row.scope==='DEALER_LEVEL' && new Date(row.starts_at)<=new Date() && (!row.ends_at || new Date(row.ends_at)>new Date()));
    return <tr key={level.id}><td><input aria-label={`${level.name} Seviye Adı`} maxLength={120} value={names[level.id] ?? level.name} onChange={e=>setNames({...names,[level.id]:e.target.value})} /></td><td><button disabled={busy || !(names[level.id] ?? level.name).trim()} onClick={()=>void perform(async()=>{await api(`/admin/dealers/levels/${level.id}`,{method:'PATCH',body:JSON.stringify({name:(names[level.id]??level.name).trim()})});onSaved();setMessage('Seviye Adı Güncellendi.');})}>Adı Kaydet</button></td><td>{!productId?'Önce Ürün Seçin':current?Number(current.amount).toLocaleString('tr-TR',{style:'currency',currency:current.currency}):'Tanımlanmamış'}</td><td><input aria-label={`${level.name} Yeni Ürün Fiyatı`} type="number" min="0" step="0.01" disabled={!productId || !canPrice || busy} value={amounts[level.id]??''} onChange={e=>setAmounts({...amounts,[level.id]:e.target.value})}/></td><td><button disabled={busy || !canPrice || !productId || !amounts[level.id] || !Number.isFinite(Number(amounts[level.id])) || Number(amounts[level.id])<0} onClick={()=>void perform(async()=>{await api('/admin/prices',{method:'POST',body:JSON.stringify({productId,scope:'DEALER_LEVEL',dealerLevelId:level.id,amount:Number(amounts[level.id]),currency:'TRY'})});setAmounts(current=>({...current,[level.id]:''}));await refresh();setMessage('Seviye Fiyatı Kaydedildi. Önceki Siparişlerin Fiyatları Değişmez.');})}>Fiyatı Kaydet</button></td></tr>;
  })}</tbody></table></div>{!canPrice && <p>Fiyat Kaydetmek İçin Mevcut Sistem Sahibi Yetkisi Gereklidir.</p>}</section>;
}
