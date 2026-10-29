'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { downloadXlsx } from '../lib/xlsx';

type Dashboard = { waiting: string; picking: string; packing: string; critical_stock: string };
type Product = { id: string; name: string; sku: string };
type Location = { id: string; code: string; name: string; is_active: boolean };
type Stock = { product_id: string; warehouse_id: string; product_name: string; sku: string; warehouse_name: string; physical_quantity: number; reserved_quantity: number; available_quantity: number };
type Movement = { id: string; movement_type: string; quantity_delta: number; reference_type: string | null; created_at: string; product_name: string; sku: string; warehouse_name: string; created_by_email: string | null };
type Transfer = { id: string; product_id: string; quantity: number; note: string | null; transferred_at: string; product_name: string; sku: string; source_warehouse_name: string; destination_warehouse_name: string; transferred_by_email: string };
type View = 'stok' | 'raporlar';

const movementLabel: Record<string, string> = { RECEIPT: 'Stok girişi', ADJUSTMENT: 'Stok düzeltmesi', RESERVATION: 'Sipariş rezervasyonu', RELEASE: 'Rezervasyon çözümü', FULFILLMENT: 'Sipariş çıkışı', TRANSFER_OUT: 'Depodan transfer', TRANSFER_IN: 'Depoya transfer', RETURN_QUARANTINE: 'İade girişi', RETURN_DAMAGED: 'Hasarlı iade' };

export default function Inventory() {
  const [view, setView] = useState<View>('stok');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [stock, setStock] = useState<Stock[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const generalStock = useMemo(() => {
    const grouped = new Map<string, Stock>();
    for (const item of stock) {
      const previous = grouped.get(item.product_id);
      grouped.set(item.product_id, {
        ...item,
        physical_quantity: Number(previous?.physical_quantity ?? 0) + Number(item.physical_quantity),
        reserved_quantity: Number(previous?.reserved_quantity ?? 0) + Number(item.reserved_quantity),
        available_quantity: Number(previous?.available_quantity ?? 0) + Number(item.available_quantity),
      });
    }
    const query = stockSearch.trim().toLocaleLowerCase('tr-TR');
    return Array.from(grouped.values()).filter(item => !query || `${item.product_name} ${item.sku}`.toLocaleLowerCase('tr-TR').includes(query)).sort((a,b) => a.product_name.localeCompare(b.product_name, 'tr'));
  }, [stock, stockSearch]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState({ code: '', name: '' });
  const [receipt, setReceipt] = useState({ productId: '', quantity: '', receivedAt: new Date().toISOString().slice(0, 10), note: '' });
  const [transfer, setTransfer] = useState({ stockKey: '', destinationWarehouseId: '', quantity: '', note: '' });

  const load = () => Promise.all([
    api<Dashboard>('/admin/warehouse/dashboard'), api<Stock[]>('/admin/warehouse/stock'), api<Movement[]>('/admin/warehouse/movements'), api<Transfer[]>('/admin/warehouse/transfers'), api<Product[]>('/admin/products'), api<Location[]>('/admin/warehouse/locations'),
  ]).then(([d, s, m, t, p, l]) => { setDashboard(d); setStock(s); setMovements(m); setTransfers(t); setProducts(p); setLocations(l); }).catch(error => setMessage(error instanceof Error ? error.message : 'Stok verileri yüklenemedi'));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const productId = new URLSearchParams(window.location.search).get('productId');
    if (productId) setReceipt(current => ({ ...current, productId }));
  }, []);

  const incoming = useMemo(() => movements.filter(item => ['RECEIPT', 'RETURN_QUARANTINE', 'TRANSFER_IN'].includes(item.movement_type)), [movements]);
  const outgoing = useMemo(() => movements.filter(item => ['FULFILLMENT', 'TRANSFER_OUT'].includes(item.movement_type)), [movements]);
  const availableLocations = locations.filter(item => item.is_active);

  async function createLocation(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await api('/admin/warehouse/locations', { method: 'POST', body: JSON.stringify(location) }); setLocation({ code: '', name: '' }); setMessage('Depo kaydedildi.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Depo kaydedilemedi'); }
    finally { setBusy(false); }
  }
  async function receiveStock(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await api('/admin/warehouse/receipts', { method: 'POST', body: JSON.stringify({ ...receipt, quantity: Number(receipt.quantity), note: receipt.note || undefined }) });
      setReceipt(current => ({ ...current, quantity: '', note: '' })); setMessage('Stok girişi kaydedildi.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Stok girişi kaydedilemedi'); }
    finally { setBusy(false); }
  }
  async function deleteStock(item: Stock) {
    if (!window.confirm(`${item.product_name} — ${item.warehouse_name} stok kaydı silinsin mi?`)) return;
    setBusy(true); setMessage('');
    try { await api(`/admin/warehouse/stock/${item.warehouse_id}/${item.product_id}`, { method: 'DELETE' }); setMessage('Stok kaydı silindi.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Stok silinemedi'); }
    finally { setBusy(false); }
  }
  async function deleteLocation(item: Location) {
    if (!window.confirm(`${item.name} deposu silinsin mi? Stok bulunan depolar silinemez.`)) return;
    setBusy(true); setMessage('');
    try { await api(`/admin/warehouse/locations/${item.id}`, { method: 'DELETE' }); setMessage('Depo silindi.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Depo silinemedi'); }
    finally { setBusy(false); }
  }
  async function saveTransfer(event: FormEvent) {
    event.preventDefault(); const selected = stock.find(item => `${item.warehouse_id}:${item.product_id}` === transfer.stockKey);
    if (!selected) { setMessage('Transfer edilecek stok seçin.'); return; }
    if (selected.warehouse_id === transfer.destinationWarehouseId) { setMessage('Kaynak ve hedef depo aynı olamaz.'); return; }
    setBusy(true); setMessage('');
    try {
      await api('/admin/warehouse/transfers', { method: 'POST', body: JSON.stringify({ productId: selected.product_id, sourceWarehouseId: selected.warehouse_id, destinationWarehouseId: transfer.destinationWarehouseId, quantity: Number(transfer.quantity), note: transfer.note || undefined }) });
      setTransfer({ stockKey: '', destinationWarehouseId: '', quantity: '', note: '' }); setMessage('Depolar arası transfer kaydedildi.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Transfer kaydedilemedi'); }
    finally { setBusy(false); }
  }
  function exportRows(name: string, rows: Movement[]) {
    const total = rows.reduce((sum, item) => sum + Number(item.quantity_delta), 0);
    downloadXlsx(`${name}.xlsx`, 'Stok Hareketleri', [['Tarih', 'İşlem', 'Ürün', 'SKU', 'Adet', 'Referans'], ...rows.map(item => [new Date(item.created_at).toLocaleString('tr-TR'), movementLabel[item.movement_type] ?? item.movement_type, item.product_name, item.sku, item.quantity_delta, item.reference_type ?? '']), ['', '', '', 'Toplam', total, '']]);
  }
  const table = (rows: Movement[], empty: string) => <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Tarih</th><th>Ürün</th><th>SKU</th><th>İşlem</th><th>Adet</th><th>İşlemi Yapan</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString('tr-TR')}</td><td>{item.product_name}</td><td>{item.sku}</td><td>{movementLabel[item.movement_type] ?? item.movement_type}</td><td>{item.quantity_delta > 0 ? '+' : ''}{item.quantity_delta}</td><td>{item.created_by_email ?? 'Sistem'}</td></tr>)}</tbody></table>{!rows.length && <p>{empty}</p>}</div>;

  return <main><AdminNav /><section className="stock-workspace"><p>STOK VE ENVANTER</p><h1>Genel Stok Yönetimi</h1><p>Ürün stok girişlerini ve ürün bazlı hareket raporlarını tek ekrandan yönetin.</p>
    <nav className="stock-local-nav" aria-label="Stok bölümleri"><button className={view === 'stok' ? 'selected' : ''} onClick={() => setView('stok')}>Stok Ve Envanter</button><button className={view === 'raporlar' ? 'selected' : ''} onClick={() => setView('raporlar')}>Gelen / Giden Raporlar</button><a href="/depo-operasyon">Sipariş Hazırlama Ve Kargo →</a></nav>
    {message && <p role="status">{message}</p>}
    {dashboard && <div className="cards"><article><p>HAZIRLANACAK</p><h2>{dashboard.waiting}</h2></article><article><p>TOPLANIYOR</p><h2>{dashboard.picking}</h2></article><article><p>PAKETLEME</p><h2>{dashboard.packing}</h2></article><article><p>KRİTİK STOK</p><h2>{dashboard.critical_stock}</h2></article></div>}
    {view === 'stok' && <><form className="form-card" onSubmit={receiveStock}><h2>Genel Stok Girişi</h2><div className="form-grid"><label>Ürün<select required value={receipt.productId} onChange={e => setReceipt(current => ({ ...current, productId: e.target.value }))}><option value="">Ürün Seçin</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label><label>Stok Giriş Adedi<input required type="number" min="1" step="1" value={receipt.quantity} onChange={e => setReceipt(current => ({ ...current, quantity: e.target.value }))} /></label><label>Stoğa Giriş Tarihi<input required type="date" value={receipt.receivedAt} onChange={e => setReceipt(current => ({ ...current, receivedAt: e.target.value }))} /></label><label>Açıklama <small>(İsteğe Bağlı)</small><input value={receipt.note} placeholder="Stok giriş notu" onChange={e => setReceipt(current => ({ ...current, note: e.target.value }))} /></label></div><button disabled={busy}>Stoğu Kaydet</button></form><section className="form-card"><h2>Mevcut Genel Stok</h2><label>Ürün Veya SKU Ara<input value={stockSearch} onChange={event=>setStockSearch(event.target.value)} placeholder="Ürün Adı Veya SKU" /></label><div className="table-wrap"><table><thead><tr><th>Ürün</th><th>SKU</th><th>Fiziksel Stok</th><th>Rezerve</th><th>Kalan Stok</th></tr></thead><tbody>{generalStock.map(item => <tr key={item.product_id}><td>{item.product_name}</td><td>{item.sku}</td><td>{item.physical_quantity}</td><td>{item.reserved_quantity}</td><td><strong>{item.available_quantity}</strong></td></tr>)}</tbody></table>{!generalStock.length && <p>Henüz stok kaydı yok.</p>}</div></section></>}
    {view === 'raporlar' && <><section className="form-card"><h2>Gelen Ürün Bazlı Rapor</h2><button disabled={!incoming.length} onClick={() => exportRows('trex-gelen-urun-raporu', incoming)}>Excel&apos;e Aktar</button>{table(incoming, 'Gelen ürün hareketi yok.')}</section><section className="form-card"><h2>Giden Ürün Bazlı Rapor</h2><button disabled={!outgoing.length} onClick={() => exportRows('trex-giden-urun-raporu', outgoing)}>Excel&apos;e Aktar</button>{table(outgoing, 'Giden ürün hareketi yok.')}</section></>}
  </section></main>;
}
