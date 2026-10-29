'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsx';
type Stock = { id: string; name: string; sku: string; status: string; physical_quantity: string; reserved_quantity: string; available_quantity: string; is_critical: boolean };
export default function StockReport() {
  const [items, setItems] = useState<Stock[]>([]);
  const [critical, setCritical] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState('');
  async function load() {
    setBusy(true); setError('');
    try { setItems(await api<Stock[]>('/admin/warehouse/stock-report')); setLoadedAt(new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Stok Raporu Yüklenemedi.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { setCritical(new URLSearchParams(window.location.search).get('critical') === 'true'); void load(); }, []);
  const rows = useMemo(() => items.filter(row => (!critical || row.is_critical) && `${row.name} ${row.sku}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))), [items, critical, search]);
  function exportReport() {
    downloadXlsx('trex-stok-raporu.xlsx', 'Stok Raporu', [['Rapor', critical ? 'Kritik Stok Seviyesindeki Ürünler' : 'Stok Durum Raporu'], ['Veri Zamanı', loadedAt], ['Arama', search], [], ['Ürün', 'SKU', 'Ürün Durumu', 'Fiziksel Stok', 'Rezerve', 'Kullanılabilir', 'Stok Uyarısı'], ...rows.map(row => [row.name, row.sku, row.status, row.physical_quantity, row.reserved_quantity, row.available_quantity, row.is_critical ? 'Kritik' : 'Normal'])]);
  }
  return <main><AdminNav /><section className="finance-workspace"><h1>{critical ? 'Kritik Stok Seviyesindeki Ürünler' : 'Stok Durum Raporu'}</h1><nav className="finance-nav"><Link href="/raporlar">Rapor Merkezi</Link><Link href="/stok">Stok Ve Envanter</Link></nav><p>Güncel Stoklar Ürün Bazında Toplanır. Stok Kaydı Olmayan Ürünler De Gösterilir. Kritik İşareti Sistemdeki Kayıtlı Stok Eşiklerine Göredir.</p><section className="form-card dealer-toolbar"><label>Ürün / SKU<input value={search} onChange={event => setSearch(event.target.value)} /></label><label>Rapor Türü<select value={critical ? 'critical' : 'all'} onChange={event => setCritical(event.target.value === 'critical')}><option value="all">Tüm Ürünler</option><option value="critical">Kritik Stok</option></select></label><div className="button-row"><button disabled={busy} onClick={() => void load()}>Raporu Yenile</button><button disabled={busy || !!error || !rows.length} onClick={exportReport}>Excel&apos;e Aktar</button></div></section>{error && <p role="alert">{error}</p>}<p>Ürün Sayısı: {rows.length} · Veri Zamanı: {loadedAt || '—'}</p><section className="table-card" aria-busy={busy}><div className="table-wrap"><table><thead><tr>{['Ürün', 'SKU', 'Ürün Durumu', 'Fiziksel Stok', 'Rezerve', 'Kullanılabilir', 'Stok Uyarısı'].map(name => <th key={name}>{name}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.sku}</td><td>{row.status === 'ACTIVE' ? 'Aktif' : row.status === 'DRAFT' ? 'Taslak' : row.status}</td><td>{row.physical_quantity}</td><td>{row.reserved_quantity}</td><td>{row.available_quantity}</td><td>{row.is_critical ? 'Kritik' : 'Normal'}</td></tr>)}{!rows.length && <tr><td colSpan={7}>{busy ? 'Yükleniyor…' : 'Seçilen Filtrede Ürün Bulunmuyor.'}</td></tr>}</tbody></table></div></section></section></main>;
}
