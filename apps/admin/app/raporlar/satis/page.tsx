'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsx';
import { currencyTotals } from '../../lib/report-totals';
import { groupSales, salesGroups, SalesGroup } from '../../lib/sales-groups';

type Row = { item_id: string; id: string; order_number: string; status: string; sales_channel: string; currency: string; created_at: string; customer_name: string; product_name: string; sku: string; quantity: number; unit_amount: string; line_total: string; payment_method: string };
type Filters = { dateFrom: string; dateTo: string; channel: string; product: string; customer: string; status: string };
const channels: Record<string, string> = { PUBLIC_WEB: 'Site', ADMIN_ORDER: 'Yönetici Siparişi', RETAIL: 'Perakende', WHOLESALE: 'Toptan', INSTAGRAM: 'Instagram', DEALER_PORTAL: 'Sistem Bayi', MARKETPLACE: 'Pazaryeri' };
const statuses: Record<string, string> = { PENDING_PAYMENT: 'Ödeme Bekliyor', PAID: 'Onaylandı', PROCESSING: 'Hazırlanıyor', SHIPPED: 'Kargoda', DELIVERED: 'Teslim Edildi', CANCELLED: 'İptal Edildi', REFUNDED: 'İade Edildi' };
const paymentNames: Record<string, string> = { bank_transfer: 'Havale / EFT', cash: 'Elden Tahsilat', cash_on_delivery_card: 'Kapıda Kart', cash_on_delivery_cash: 'Kapıda Nakit', paytr: 'PayTR' };
const money = (value: string, currency: string) => Number(value).toLocaleString('tr-TR', { style: 'currency', currency });
const date = (days = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() - days * 86400000));
const displayDate = (value: string) => new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

export default function SalesReport() {
  const [group, setGroup] = useState<SalesGroup | ''>('');
  const [filters, setFilters] = useState<Filters>({ dateFrom: date(30), dateTo: date(), channel: '', product: '', customer: '', status: '' });
  const [loadedFilters, setLoadedFilters] = useState<Filters | null>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requestId = useRef(0);
  const change = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  async function load(snapshot: Filters) {
    if (!snapshot.dateFrom || !snapshot.dateTo || snapshot.dateFrom > snapshot.dateTo) {
      setMessage('Geçerli Bir Başlangıç Ve Bitiş Tarihi Seçin.');
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    setMessage('');
    try {
      const query = new URLSearchParams(Object.entries(snapshot).filter(([, value]) => value !== ''));
      const rows = await api<Row[]>(`/admin/orders/sales-report?${query}`);
      if (id === requestId.current) { setItems(rows); setLoadedFilters({ ...snapshot }); }
    } catch (error) {
      if (id === requestId.current) setMessage(error instanceof Error ? error.message : 'Satış Raporu Yüklenemedi.');
    } finally { if (id === requestId.current) setBusy(false); }
  }
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('group');
    if (requested && Object.hasOwn(salesGroups, requested)) setGroup(requested as SalesGroup);
    void load(filters); return () => { requestId.current++; };
  }, []);
  const grouped = useMemo(() => group ? groupSales(items, group) : [], [items, group]);
  const groupLabel = (label: string) => group === 'channel' ? channels[label] ?? label : group === 'payment' ? paymentNames[label] ?? label : label;
  const totals = useMemo(() => currencyTotals(items.filter(row => row.status !== 'CANCELLED').map(row => ({ currency: row.currency, amount: row.line_total }))), [items]);
  function exportReport() {
    if (!loadedFilters || busy) return;
    downloadXlsx('trex-satis-raporu.xlsx', 'Satış Raporu', [
      ['Başlangıç', loadedFilters.dateFrom], ['Bitiş', loadedFilters.dateTo],
      ['Satış Kanalı', (channels[loadedFilters.channel] ?? loadedFilters.channel) || 'Tüm Kanallar'],
      ['Ürün / SKU', loadedFilters.product], ['Müşteri', loadedFilters.customer], ['Durum', statuses[loadedFilters.status] ?? 'Tüm Durumlar'], [],
      ...(group ? [[salesGroups[group]], ['Grup', 'Durum', 'Sipariş Sayısı', 'Ürün Adedi', 'Tutar', 'Para Birimi'], ...grouped.map(row => [groupLabel(row.label), statuses[row.status] ?? row.status, String(row.orderCount), String(row.quantity), row.amount, row.currency]), []] : []),
      ['Sipariş Tarihi', 'Sipariş No', 'Satış Kanalı', 'Müşteri', 'Ürün', 'SKU', 'Adet', 'Birim Fiyat', 'Satış Tutarı', 'Para Birimi', 'Ödeme Yöntemi', 'Sipariş Durumu'],
      ...items.map(row => [displayDate(row.created_at), row.order_number, channels[row.sales_channel] ?? row.sales_channel, row.customer_name, row.product_name, row.sku, String(row.quantity), row.unit_amount, row.line_total, row.currency, row.payment_method, statuses[row.status] ?? row.status]),
      [], ['Brüt Satış — İptaller Hariç; Tahsilat Tutarı Değildir'],
      ...totals.map(total => ['Toplam', total.currency, total.amount]),
    ]);
  }
  return <main><AdminNav /><section className="finance-workspace">
    <h1>{group ? salesGroups[group] : 'Detaylı Satış Raporu'}</h1>
    <p>Her Ürün Ayrı Satırda Gösterilir. Para Birimleri Ayrı Toplanır.</p>
    <nav className="finance-nav"><Link href="/raporlar">Rapor Merkezi</Link><Link href="/siparisler">Siparişler</Link></nav>
    <section className="form-card dealer-toolbar" aria-label="Rapor Filtreleri">
      <label>Rapor Türü<select value={group} onChange={event => setGroup(event.target.value as SalesGroup | '')}><option value="">Detaylı Satış Raporu</option>{Object.entries(salesGroups).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label>Başlangıç Tarihi<input type="date" value={filters.dateFrom} onChange={event => change('dateFrom', event.target.value)} /></label>
      <label>Bitiş Tarihi<input type="date" value={filters.dateTo} onChange={event => change('dateTo', event.target.value)} /></label>
      <label>Satış Kanalı<select value={filters.channel} onChange={event => change('channel', event.target.value)}><option value="">Tüm Kanallar</option>{Object.entries(channels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>Ürün / SKU<input value={filters.product} onChange={event => change('product', event.target.value)} placeholder="Ürün Adı Veya SKU" /></label>
      <label>Müşteri<input value={filters.customer} onChange={event => change('customer', event.target.value)} placeholder="Ad Veya E-Posta" /></label>
      <label>Sipariş Durumu<select value={filters.status} onChange={event => change('status', event.target.value)}><option value="">Tüm Durumlar</option>{Object.entries(statuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <div className="button-row"><button disabled={busy} onClick={() => void load(filters)}>{busy ? 'Yükleniyor…' : 'Raporu Getir'}</button><button className="secondary" disabled={busy || !items.length} onClick={exportReport}>Excel&apos;e Aktar</button></div>
    </section>
    {message && <p role="alert" className="notice">{message}</p>}
    {loadedFilters && <p>Yüklenen Rapor: {loadedFilters.dateFrom} — {loadedFilters.dateTo}. Filtre Değişikliklerini Uygulamak İçin Raporu Getir Butonuna Basın.</p>}
    <div className="cards dealer-summary-cards">
      <article><p>Sipariş Sayısı</p><strong>{new Set(items.map(row => row.id)).size}</strong><p>Ürün Satırı: {items.length}</p></article>
      {totals.map(total => <article key={total.currency}><p>Brüt Satış · {total.currency}</p><strong>{money(total.amount, total.currency)}</strong><p>İptaller Hariç; Tahsilat Tutarı Değildir.</p></article>)}
    </div>
    {group && <section className="table-card" aria-busy={busy}><h2>{salesGroups[group]}</h2><p>Durumlar Ve Para Birimleri Ayrı Gösterilir. Tutarlar Ürün Satırlarının Toplamıdır; Tahsilat Değildir. Aynı Sipariş Farklı Ürün Gruplarında Yer Alabilir. Haftalar Pazartesi Başlar.</p><div className="table-wrap"><table><thead><tr><th>Grup</th><th>Durum</th><th>Sipariş Sayısı</th><th>Ürün Adedi</th><th>Tutar</th><th>Para Birimi</th></tr></thead><tbody>{grouped.map(row => <tr key={row.key}><td>{groupLabel(row.label)}</td><td>{statuses[row.status] ?? row.status}</td><td>{row.orderCount}</td><td>{row.quantity}</td><td>{money(row.amount, row.currency)}</td><td>{row.currency}</td></tr>)}{!grouped.length && <tr><td colSpan={6}>Seçilen Filtrede Kayıt Bulunmuyor.</td></tr>}</tbody></table></div></section>}
    <section className="table-card" aria-busy={busy}><h2>Sipariş Ve Ürün Satırları</h2><div className="table-wrap"><table>
      <thead><tr>{['Tarih', 'Sipariş', 'Kanal', 'Müşteri', 'Ürün', 'Adet', 'Birim Fiyat', 'Satış Tutarı', 'Para Birimi', 'Ödeme', 'Durum'].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{items.map(row => <tr key={row.item_id}><td>{displayDate(row.created_at)}</td><td>{row.order_number}</td><td>{channels[row.sales_channel] ?? row.sales_channel}</td><td>{row.customer_name}</td><td><b>{row.product_name}</b><small>{row.sku}</small></td><td>{row.quantity}</td><td>{money(row.unit_amount, row.currency)}</td><td>{money(row.line_total, row.currency)}</td><td>{row.currency}</td><td>{row.payment_method || '—'}</td><td>{statuses[row.status] ?? row.status}</td></tr>)}
      {!items.length && <tr><td colSpan={11}>{busy ? 'Yükleniyor…' : 'Seçilen Filtrede Satış Kaydı Bulunmuyor.'}</td></tr>}
      </tbody></table></div></section>
  </section></main>;
}
