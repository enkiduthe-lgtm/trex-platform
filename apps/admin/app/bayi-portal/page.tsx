'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, clearToken, logout } from '../lib/api';
import { currencyTotals } from '../lib/report-totals';
import styles from './portal.module.css';

type Summary = { company_name: string; code: string; dealer_balance: string; order_count: string; agreement_accepted_at: string | null };
type Product = { id: string; name: string; sku: string; amount: string | null; currency: string | null };
type Options = { products: Product[]; warehouses: { id: string; name: string }[] };
type Order = { id: string; order_number: string; status: string; total_amount: string; currency: string; created_at: string };
type Commission = { id: string; order_number: string; amount: string; currency: string; status: string; entry_kind: string; created_at: string; note: string | null };
type Ledger = { id: string; direction: string; amount: string; currency: string; description: string; reference_type: string; created_at: string };
type Shipment = { id: string; order_number: string; provider: string; tracking_number: string | null; status: string };
type Item = { productId: string; quantity: number; unitAmount: string; currency: string };
const tabs = ['Yeni Sipariş', 'Ürünler', 'Siparişlerim', 'Kargo Takibi', 'Primlerim', 'Cari Hesabım'] as const;
type Tab = typeof tabs[number];
const statuses: Record<string, string> = { PENDING_PAYMENT: 'Ödeme Bekliyor', PAID: 'Onaylandı', PROCESSING: 'Hazırlanıyor', SHIPPED: 'Kargoda', DELIVERED: 'Teslim Edildi', CANCELLED: 'İptal Edildi', REFUNDED: 'İade Edildi', PENDING: 'Bekliyor', CONFIRMED: 'Kesinleşti', AVAILABLE: 'Kullanılabilir', CREATED: 'Kargo Kaydı Oluşturuldu', FAILED: 'İşlem Başarısız' };
const money = (value: string, currency = 'TRY') => Number(value).toLocaleString('tr-TR', { style: 'currency', currency });
const date = (value: string) => new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
const initial = { recipientName: '', contactEmail: '', phone: '', city: '', district: '', addressLine: '', postalCode: '', paymentMethod: 'TRANSFER', productId: '', quantity: 1 };

export default function DealerPortal() {
  const [tab, setTab] = useState<Tab>('Yeni Sipariş');
  const [email, setEmail] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [options, setOptions] = useState<Options>({ products: [], warehouses: [] });
  const [orders, setOrders] = useState<Order[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [form, setForm] = useState(initial);
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState('');
  const product = options.products.find(row => row.id === form.productId);
  const balances = useMemo(() => currencyTotals(ledger.map(row => ({ currency: row.currency, amount: row.direction === 'DEBIT' ? row.amount : `-${row.amount}` }))), [ledger]);
  const available = useMemo(() => currencyTotals(commissions.filter(row => ['CONFIRMED', 'AVAILABLE'].includes(row.status)).map(row => ({ currency: row.currency, amount: row.amount }))), [commissions]);
  const totals = useMemo(() => currencyTotals(items.map(row => ({ currency: row.currency, amount: (Number(row.unitAmount) * row.quantity).toFixed(2) }))), [items]);
  const change = (key: keyof typeof initial, value: string | number) => setForm(current => ({ ...current, [key]: value }));
  async function load() {
    const me = await api<{ user: { email: string; role: string } }>('/auth/me');
    if (me.user.role !== 'DEALER') throw new Error('Bu Alan Yalnızca Bayi Hesapları İçindir.');
    const [account, products, listed, earned, movements, deliveries] = await Promise.all([
      api<Summary>('/dealer-portal/summary'), api<Options>('/dealer-portal/creation-options'), api<Order[]>('/dealer-portal/orders'),
      api<Commission[]>('/dealer-portal/commissions'), api<Ledger[]>('/dealer-portal/ledger'), api<Shipment[]>('/dealer-portal/shipments'),
    ]);
    setEmail(me.user.email); setSummary(account); setOptions(products); setOrders(listed); setCommissions(earned); setLedger(movements); setShipments(deliveries);
    setForm(current => ({ ...current, contactEmail: current.contactEmail || me.user.email })); setReady(true);
  }
  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : 'Bayi Bilgileri Yüklenemedi.')); }, []);
  function addItem(selected = product) {
    if (!selected || selected.amount === null || !selected.currency) return setMessage('Fiyatı Tanımlı Bir Ürün Seçin.');
    if (!Number.isInteger(form.quantity) || form.quantity < 1 || form.quantity > 100000) return setMessage('Geçerli Bir Adet Girin.');
    if (items.some(row => row.productId === selected.id)) return setMessage('Bu Ürün Zaten Siparişte Bulunuyor.');
    if (items.some(row => row.currency !== selected.currency)) return setMessage('Farklı Para Birimleri İçin Ayrı Sipariş Oluşturun.');
    setItems(current => [...current, { productId: selected.id, quantity: form.quantity, unitAmount: selected.amount!, currency: selected.currency! }]);
    setForm(current => ({ ...current, productId: '', quantity: 1 })); setMessage(''); setTab('Yeni Sipariş');
  }
  async function action(work: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'İşlem Tamamlanamadı.'); } finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!items.length) return setMessage('Siparişe En Az Bir Ürün Ekleyin.');
    if (!options.warehouses[0]) return setMessage('Genel Stok Tanımı Bulunamadı. Yöneticiyle İletişime Geçin.');
    await action(async () => {
      const result = await api<{ order_number: string }>('/dealer-portal/orders', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ ...form, warehouseId: options.warehouses[0].id, currency: items[0].currency, items: items.map(({ productId, quantity, unitAmount }) => ({ productId, quantity, unitAmount: Number(unitAmount) })), priceChangeReason: 'Bayi Portalı Fiyatı' }) });
      setItems([]); setForm({ ...initial, contactEmail: email }); setTab('Siparişlerim');
      setMessage(`${result.order_number} Numaralı Sipariş Oluşturuldu.`); await load();
    });
  }
  return <main className={styles.page}>
    <header className={styles.header}><div><p>Bayi Paneli</p><h1>{summary?.company_name || 'Bayi Paneli'}</h1><p>{summary?.code} · {email}</p></div><button type="button" className="secondary" onClick={() => void action(async () => { try { await logout(); } finally { clearToken(); window.location.assign('/giris'); } })}>Güvenli Çıkış</button></header>
    {message && <p role="status" className="notice">{message}</p>}
    <section className={styles.cards} aria-label="Hesap Özeti"><article><h2>Siparişlerim</h2><strong>{summary?.order_count ?? '—'}</strong></article><article><h2>Kullanılabilir Prim</h2>{available.length ? available.map(row => <strong key={row.currency}>{money(row.amount, row.currency)}</strong>) : <p>Kayıt Bulunmuyor.</p>}<small>Son 100 Prim Hareketi</small></article><article><h2>Cari Bakiye</h2>{balances.length ? balances.map(row => <strong key={row.currency}>{money(row.amount, row.currency)}</strong>) : <p>Kayıt Bulunmuyor.</p>}</article></section>
    <nav className={styles.tabs} aria-label="Bayi Paneli Bölümleri">{tabs.map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{value}</button>)}</nav>
    {!ready ? <section className={styles.box}><p>Bayi Bilgileri Bekleniyor.</p></section> : <>
    {tab === 'Yeni Sipariş' && <section className={styles.box}><h2>Yeni Bayi Siparişi</h2>{!summary?.agreement_accepted_at ? <><p>Sipariş Vermek İçin Bayilik Sözleşmesini Kabul Edin. IBAN Bilgisi İsteğe Bağlıdır.</p><button disabled={busy} onClick={() => void action(async () => { await api('/dealer-portal/agreement/accept', { method: 'POST' }); await load(); })}>Sözleşmeyi Kabul Ediyorum</button></> : <form onSubmit={event => void create(event)}>
      <div className={styles.grid}>{([['recipientName', 'Alıcı Adı'], ['contactEmail', 'E-Posta'], ['phone', 'Telefon'], ['city', 'İl'], ['district', 'İlçe'], ['postalCode', 'Posta Kodu']] as const).map(([key, label]) => <label key={key}>{label}<input required={key !== 'postalCode'} type={key === 'contactEmail' ? 'email' : 'text'} value={form[key]} onChange={event => change(key, event.target.value)} /></label>)}<label>Ödeme Yöntemi<select value={form.paymentMethod} onChange={event => change('paymentMethod', event.target.value)}><option value="TRANSFER">Havale / EFT</option><option value="COD_CASH">Kapıda Nakit</option><option value="COD_CARD">Kapıda Kart</option><option value="HAND_CASH">Elden Tahsilat</option></select></label><label className={styles.full}>Açık Adres<textarea required value={form.addressLine} onChange={event => change('addressLine', event.target.value)} /></label></div>
      <h3>Ürün Ekle</h3><div className={styles.grid}><label>Ürün<select value={form.productId} onChange={event => change('productId', event.target.value)}><option value="">Ürün Seçin</option>{options.products.filter(row => row.amount !== null).map(row => <option key={row.id} value={row.id}>{row.name} · {money(row.amount!, row.currency || 'TRY')}</option>)}</select></label><label>Adet<input type="number" min="1" max="100000" value={form.quantity} onChange={event => change('quantity', Number(event.target.value))} /></label><div className={styles.actions}><button type="button" disabled={busy} onClick={() => addItem()}>Siparişe Ekle</button></div></div>
      <div className={styles.table}><table><thead><tr><th>Ürün</th><th>Adet</th><th>Bayi Birim Fiyatı</th><th>İşlem</th></tr></thead><tbody>{items.map(row => <tr key={row.productId}><td>{options.products.find(p => p.id === row.productId)?.name}</td><td>{row.quantity}</td><td>{money(row.unitAmount, row.currency)}</td><td><button type="button" className="secondary" onClick={() => setItems(current => current.filter(item => item.productId !== row.productId))}>Çıkar</button></td></tr>)}{!items.length && <tr><td colSpan={4}>Henüz Ürün Eklenmedi.</td></tr>}</tbody></table></div><div className={styles.actions}>{totals.map(row => <strong key={row.currency}>Toplam: {money(row.amount, row.currency)}</strong>)}<button type="submit" disabled={busy || !items.length}>{busy ? 'İşleniyor…' : 'Siparişi Oluştur'}</button></div>
    </form>}</section>}
    {tab === 'Ürünler' && <section className={styles.box}><h2>Ürünler Ve Bayi Fiyatları</h2><label>Ürün Ara<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Ürün Adı Veya SKU" /></label><div className={styles.table}><table><thead><tr><th>Ürün</th><th>SKU</th><th>Bayi Fiyatı</th><th>İşlem</th></tr></thead><tbody>{options.products.filter(row => `${row.name} ${row.sku}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))).map(row => <tr key={row.id}><td>{row.name}</td><td>{row.sku}</td><td>{row.amount === null ? 'Fiyat Tanımlanmamış' : money(row.amount, row.currency || 'TRY')}</td><td><button disabled={busy || row.amount === null} onClick={() => addItem(row)}>Siparişe Ekle</button></td></tr>)}</tbody></table></div></section>}
    {tab === 'Siparişlerim' && <section className={styles.box}><h2>Siparişlerim</h2><div className={styles.table}><table><thead><tr><th>Sipariş No</th><th>Tarih</th><th>Tutar</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{orders.map(row => <tr key={row.id}><td>{row.order_number}</td><td>{date(row.created_at)}</td><td>{money(row.total_amount, row.currency)}</td><td>{statuses[row.status] ?? row.status}</td><td>{['PENDING_PAYMENT', 'PROCESSING'].includes(row.status) ? <button disabled={busy} onClick={() => { if (window.confirm(`${row.order_number} Numaralı Sipariş İptal Edilsin Mi?`)) void action(async () => { await api(`/dealer-portal/orders/${row.id}/cancel`, { method: 'POST' }); await load(); }); }}>Siparişi İptal Et</button> : '—'}</td></tr>)}{!orders.length && <tr><td colSpan={5}>Henüz Sipariş Bulunmuyor.</td></tr>}</tbody></table></div></section>}
    {tab === 'Kargo Takibi' && <section className={styles.box}><h2>Kargo Kayıtlarım</h2><p>Yalnızca Kaydedilmiş Kargo Bilgileri Gösterilir.</p><div className={styles.table}><table><thead><tr><th>Sipariş</th><th>Kargo Firması</th><th>Takip Numarası</th><th>Kayıt Durumu</th></tr></thead><tbody>{shipments.map(row => <tr key={row.id}><td>{row.order_number}</td><td>{row.provider}</td><td>{row.tracking_number || 'Henüz Oluşmadı'}</td><td>{statuses[row.status] ?? row.status}</td></tr>)}{!shipments.length && <tr><td colSpan={4}>Henüz Kargo Kaydı Bulunmuyor.</td></tr>}</tbody></table></div></section>}
    {tab === 'Primlerim' && <section className={styles.box}><h2>Prim Hareketlerim</h2><p>Son 100 Prim Hareketi Gösterilir.</p><div className={styles.table}><table><thead><tr><th>Tarih</th><th>Sipariş</th><th>Tutar</th><th>Durum</th><th>Açıklama</th></tr></thead><tbody>{commissions.map(row => <tr key={row.id}><td>{date(row.created_at)}</td><td>{row.order_number}</td><td>{money(row.amount, row.currency)}</td><td>{row.entry_kind === 'REVERSAL' ? 'Ters Kayıt' : statuses[row.status] ?? row.status}</td><td>{row.note || '—'}</td></tr>)}{!commissions.length && <tr><td colSpan={5}>Henüz Prim Hareketi Bulunmuyor.</td></tr>}</tbody></table></div></section>}
    {tab === 'Cari Hesabım' && <section className={styles.box}><h2>Cari Hesap Hareketlerim</h2><div className={styles.table}><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Açıklama</th></tr></thead><tbody>{ledger.map(row => <tr key={row.id}><td>{date(row.created_at)}</td><td>{row.direction === 'DEBIT' ? 'Borç' : 'Alacak'}</td><td>{money(row.amount, row.currency)}</td><td>{row.description || '—'}</td></tr>)}{!ledger.length && <tr><td colSpan={4}>Henüz Cari Hareket Bulunmuyor.</td></tr>}</tbody></table></div></section>}
    </>}
  </main>;
}
