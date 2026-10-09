'use client';

import { useState } from 'react';
import { api } from '../lib/api';

type PickItem = { id: string; product_name: string; sku: string; barcode: string | null; expected_quantity: number; picked_quantity: number; lot_code: string | null; expiry_date: string | null; location_code: string | null };
type Pick = { id: string; status: string; order_number: string; warehouse_name: string; items: PickItem[] };

export function PickOperations() {
  const [pickId, setPickId] = useState('');
  const [pick, setPick] = useState<Pick | null>(null);
  const [message, setMessage] = useState('');
  const [barcode, setBarcode] = useState('');
  const load = async () => {
    if (!pickId.trim()) { setMessage('Önce toplama listesi kimliğini girin.'); return; }
    try { setPick(await api<Pick>(`/admin/warehouse/picks/${pickId.trim()}`)); setMessage(''); }
    catch (error) { setPick(null); setMessage(error instanceof Error ? error.message : 'Toplama listesi açılamadı'); }
  };
  const update = async (item: PickItem, value: number) => {
    if (!pick) return;
    try { await api(`/admin/warehouse/picks/${pick.id}/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ pickedQuantity: value }) }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Adet kaydedilemedi'); }
  };
  const complete = async (action: 'complete' | 'pack') => {
    if (!pick) return;
    try { const result = await api<{ packageBarcode?: string }>(`/admin/warehouse/picks/${pick.id}/${action}`, { method: 'POST' }); await load(); setMessage(action === 'complete' ? 'Toplama tamamlandı; paketlemeye hazır.' : `Paketleme tamamlandı; sipariş sevke hazır. Paket barkodu: ${result.packageBarcode ?? '-'}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'İşlem tamamlanamadı'); }
  };
  const scan = async () => {
    if (!pick || !barcode.trim()) { setMessage('Barkodu okutun veya girin.'); return; }
    try { const result = await api<{ productName: string; pickedQuantity: number; expectedQuantity: number }>(`/admin/warehouse/picks/${pick.id}/scan`, { method: 'POST', body: JSON.stringify({ barcode: barcode.trim() }) }); setBarcode(''); await load(); setMessage(`${result.productName} okutuldu: ${result.pickedQuantity}/${result.expectedQuantity}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Barkod doğrulanamadı'); }
  };
  return <article className="form-card"><h2>Toplama ve paketleme işlemi</h2><p>Listeden gelen kimliği girin; sistem lot/SKT için FEFO önerisini de gösterir.</p><label>Toplama listesi kimliği<input value={pickId} onChange={(event) => setPickId(event.target.value)} placeholder="Toplama listesi ID" /></label><button type="button" onClick={() => void load()}>Listeyi aç</button>{message && <p role="status">{message}</p>}{pick && <div><h3>{pick.order_number} · {pick.status}</h3>{(pick.status === 'OPEN' || pick.status === 'IN_PROGRESS') && <label>Ürün barkodu<input value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void scan(); } }} placeholder="Barkodu okutun" /><button type="button" onClick={() => void scan()}>Barkodu doğrula</button></label>}{pick.items.map((item) => <div className="pick-row" key={item.id}><strong>{item.product_name}</strong><span>{item.sku}{item.barcode ? ` · Barkod: ${item.barcode}` : ''}</span><span>{item.location_code ? `Raf: ${item.location_code}` : 'Raf tanımlı değil'}{item.lot_code ? ` · Lot: ${item.lot_code}` : ''}{item.expiry_date ? ` · SKT: ${new Date(item.expiry_date).toLocaleDateString('tr-TR')}` : ''}</span><label>Toplanan adet<input type="number" min="0" max={item.expected_quantity} value={item.picked_quantity} onChange={(event) => void update(item, Number(event.target.value))} /></label><span>Hedef: {item.expected_quantity}</span></div>)}{pick.status === 'OPEN' || pick.status === 'IN_PROGRESS' ? <button type="button" onClick={() => void complete('complete')}>Toplamayı tamamla</button> : null}{pick.status === 'COMPLETED' ? <button type="button" onClick={() => void complete('pack')}>Paketlemeyi tamamla</button> : null}</div>}</article>;
}
