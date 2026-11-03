'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsx';
import { financeDateTime, financeTotals, inFinancePeriod } from '../../lib/finance-report';

type Collection = { id: string; account_name: string; currency: string; amount: string; counterparty_name: string | null; reference_number: string | null; description: string; occurred_at: string };
type Transfer = Collection & { kind: string; payment_status: string | null; order_number: string | null; order_id: string | null; approved_at: string | null };
const statusLabels: Record<string,string> = { PENDING: 'Bekliyor', COLLECTION_PENDING: 'Tahsilat Bekliyor', PARTIALLY_PAID: 'Kısmen Ödendi', PAID: 'Ödendi', REFUNDED: 'İade Edildi', OVERDUE: 'Gecikmiş' };
type Account = { id: string; name: string; currency: string; is_active: boolean };
type User = { user: { role: string } };
const money = (amount: string, currency: string) => Number(amount).toLocaleString('tr-TR', { style: 'currency', currency });

function CollectionsContent() {
  const searchParams = useSearchParams();
  const selectedOrder = searchParams.get('order')?.trim() ?? '';
  const [items, setItems] = useState<Collection[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [role, setRole] = useState('');
  const [tab, setTab] = useState<'PENDING' | 'ENTRY' | 'HISTORY'>('PENDING');
  const [history, setHistory] = useState<Transfer[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [message, setMessage] = useState('');
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [entry, setEntry] = useState({ accountId: '', amount: '', counterpartyName: '', referenceNumber: '', description: '' });
  const isOwner = role === 'SUPER_ADMIN';

  const load = async () => {
    setHistoryReady(false); setHistory([]);
    try {
      const [collections, me] = await Promise.all([api<Collection[]>('/admin/finance/pending-collections'), api<User>('/auth/me')]);
      setItems(collections); setRole(me.user.role);
      if (me.user.role === 'SUPER_ADMIN') {
        const [list, movements] = await Promise.all([api<Account[]>('/admin/finance/accounts'), api<Transfer[]>('/admin/finance/transactions')]);
        setHistory(movements.filter(item => item.kind === 'COLLECTION')); setHistoryReady(true);
        const active = list.filter((item) => item.is_active);
        setAccounts(active);
        if (!entry.accountId && active[0]) setEntry((current) => ({ ...current, accountId: active[0].id }));
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Havale kayıtları yüklenemedi.'); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const sync = () => { if (window.location.hash === '#giris') setTab('ENTRY'); }; sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
  useEffect(() => { if (role && !isOwner && tab !== 'PENDING') setTab('PENDING'); }, [role, isOwner, tab]);
  useEffect(() => {
    if (selectedOrder && items.length) {
      setOrders((current) => Object.fromEntries(items.map((item) => [item.id, current[item.id] || selectedOrder])));
    }
  }, [items, selectedOrder]);
  const shownItems = useMemo(() => items.filter(item => inFinancePeriod(item.occurred_at, dateFrom, dateTo)), [items, dateFrom, dateTo]);
  const shownHistory = useMemo(() => history.filter(item => inFinancePeriod(item.occurred_at, dateFrom, dateTo)), [history, dateFrom, dateTo]);
  const reportItems = tab === 'HISTORY' ? shownHistory : shownItems;

  function exportCollections() {
    if (!reportItems.length) { setMessage('Dışa Aktarılacak Havale Bulunamadı.'); return; }
    downloadXlsx('trex-gelen-havaleler.xlsx', 'Gelen Havaleler', [
      ['Banka Hesabı', 'Gönderen', 'Tarih', 'Tutar', 'Para Birimi', 'Durum', 'İlgili Sipariş', 'Dekont / Referans', 'Açıklama'],
      ...reportItems.map(item => { const recorded = tab === 'HISTORY' ? item as Transfer : null; return [item.account_name, item.counterparty_name ?? '', financeDateTime(item.occurred_at), Number(item.amount), item.currency, recorded ? statusLabels[recorded.payment_status ?? ''] ?? recorded.payment_status ?? 'Belirtilmemiş' : 'Bekliyor', recorded?.order_number ?? '', item.reference_number ?? '', item.description]; }),
      ...financeTotals(reportItems).map(total => ['Toplam', '', '', total.amount, total.currency, '', '', '', '']),
    ]);
  }

  async function approve(event: FormEvent, id: string) {
    event.preventDefault(); const orderId = orders[id]?.trim();
    if (!orderId) { setMessage('Sipariş numarası veya sipariş kimliği girin.'); return; }
    try {
      await api(`/admin/finance/collections/${id}/approve`, { method: 'POST', body: JSON.stringify({ orderId }) });
      setMessage('Havale onaylandı ve siparişle eşleştirildi.'); void load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Onaylanamadı.'); }
  }

  async function addCollection(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/admin/finance/transactions', { method: 'POST', body: JSON.stringify({
        accountId: entry.accountId, kind: 'COLLECTION', amount: Number(entry.amount), paymentStatus: 'PENDING',
        counterpartyName: entry.counterpartyName || undefined, referenceNumber: entry.referenceNumber || undefined,
        description: entry.description,
      }) });
      setEntry((current) => ({ ...current, amount: '', counterpartyName: '', referenceNumber: '', description: '' }));
      setMessage('Gelen havale kaydedildi; yönetici eşleştirme ve onay için görebilir.'); void load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Havale kaydedilemedi.'); }
  }

  return <main><AdminNav /><section>
    <p>SİPARİŞLER / HAVALE EŞLEŞTİRME</p><h1>Havale İşlemleri</h1>
    <p>{isOwner ? 'Gelen tutarı girin; yönetici veya ana yönetici siparişle eşleştirip onaylayabilir.' : 'Bekleyen havaleleri sipariş numarasıyla eşleştirip onaylayabilirsiniz. Para hareketi ve hesap yönetimi yalnız ana yöneticidedir.'}</p>
    {selectedOrder && <p className="selected-order">Onay için seçilen sipariş: <strong>{selectedOrder}</strong>. Aşağıdan ilgili gelen havaleyi seçip eşleştirin.</p>}
    <p><Link href="/siparisler">← Siparişlere dön</Link></p>{message && <p role="status">{message}</p>}
    <div className="period-toolbar" role="tablist" aria-label="Havale İşlemleri"><button type="button" role="tab" aria-selected={tab === 'PENDING'} onClick={() => setTab('PENDING')}>Bekleyen Havale Eşleştirme</button>{isOwner && <><button type="button" role="tab" aria-selected={tab === 'ENTRY'} onClick={() => setTab('ENTRY')}>Gelen Havale Girişi</button><button type="button" role="tab" aria-selected={tab === 'HISTORY'} onClick={() => setTab('HISTORY')}>Gelen Havale Geçmişi</button></>}</div>{isOwner && tab === 'ENTRY' && <form id="giris" className="transfer-entry" onSubmit={addCollection}><div className="transfer-entry-head"><h2>Hesaba gelen havale girişi</h2><p>Havale kaydedilince aşağıdaki bekleyen kayıtlar arasına eklenir.</p></div><div className="transfer-entry-grid">
      <label>Banka / kasa hesabı<select required value={entry.accountId} onChange={(event) => setEntry((current) => ({ ...current, accountId: event.target.value }))}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
      <label>Tutar<input required min="0.01" step="0.01" type="number" value={entry.amount} onChange={(event) => setEntry((current) => ({ ...current, amount: event.target.value }))} /></label>
      <label>Gönderen adı<input value={entry.counterpartyName} onChange={(event) => setEntry((current) => ({ ...current, counterpartyName: event.target.value }))} /></label>
      <label>Dekont / banka referansı<input value={entry.referenceNumber} onChange={(event) => setEntry((current) => ({ ...current, referenceNumber: event.target.value }))} /></label>
      <label>Açıklama<input required value={entry.description} placeholder="Örn. müşteri havalesi" onChange={(event) => setEntry((current) => ({ ...current, description: event.target.value }))} /></label>
      <button>Bekleyen havaleyi kaydet</button>
    </div></form>}
    {tab !== 'ENTRY' && <><div className="period-toolbar"><h2>{tab === 'HISTORY' ? 'Gelen Havale Geçmişi' : 'Bekleyen Havale Kayıtları'}</h2><label>Başlangıç<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>Bitiş<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>{(dateFrom || dateTo) && <button type="button" className="secondary" onClick={() => { setDateFrom(''); setDateTo(''); }}>Tarihi Temizle</button>}<button type="button" disabled={!reportItems.length || (tab === 'HISTORY' && !historyReady)} onClick={exportCollections}>Excel&apos;e Aktar</button></div>
    {dateFrom && dateTo && dateFrom > dateTo && <p role="alert">Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz.</p>}<div className="cards">{financeTotals(reportItems).map(total => <article key={total.currency}><p>Toplam Havale · {total.currency}</p><strong>{money(String(total.amount), total.currency)}</strong></article>)}</div>{tab === 'HISTORY' ? <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Tarih</th><th>Banka Hesabı</th><th>Gönderen</th><th>Tutar</th><th>Durum</th><th>İlgili Sipariş</th><th>Dekont / Referans</th><th>Açıklama</th></tr></thead><tbody>{shownHistory.map(item => <tr key={item.id}><td>{financeDateTime(item.occurred_at)}</td><td>{item.account_name}</td><td>{item.counterparty_name ?? '—'}</td><td>{money(item.amount, item.currency)}</td><td>{statusLabels[item.payment_status ?? ''] ?? item.payment_status ?? 'Belirtilmemiş'}</td><td>{item.order_number ? <Link href={`/siparisler/${item.order_id}`}>{item.order_number}</Link> : '—'}</td><td>{item.reference_number ?? '—'}</td><td>{item.description}</td></tr>)}</tbody></table>{!shownHistory.length && <p className="empty-state">{historyReady ? 'Bu Tarih Aralığında Havale Yok.' : 'Havale Geçmişi Yüklenemedi.'}</p>}</div></div> : <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Tarih</th><th>Hesap</th><th>Gönderen</th><th>Tutar</th><th>Dekont / Referans</th><th>Açıklama</th><th>Siparişle Eşleştir</th></tr></thead><tbody>{shownItems.map(item => <tr key={item.id}><td>{financeDateTime(item.occurred_at)}</td><td>{item.account_name}</td><td>{item.counterparty_name ?? '—'}</td><td>{money(item.amount, item.currency)}</td><td>{item.reference_number ?? '—'}</td><td>{item.description}</td><td><form onSubmit={event => approve(event, item.id)}><label>Sipariş Numarası<input required placeholder="Örn. TRX-10025" value={orders[item.id] ?? ''} onChange={event => setOrders(value => ({...value, [item.id]: event.target.value}))}/></label><button>Havaleyi Eşleştir Ve Onayla</button></form></td></tr>)}</tbody></table>{!shownItems.length && <p className="empty-state">Bu Tarih Aralığında Bekleyen Havale Yok.</p>}</div></div>}</>}
  </section></main>;
}

export default function Collections() {
  return <Suspense fallback={<main><AdminNav /><section><p>Havale ekranı hazırlanıyor…</p></section></main>}><CollectionsContent /></Suspense>;
}
