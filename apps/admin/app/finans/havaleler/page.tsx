'use client';

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminNav } from '../../components/admin-nav';
import { orderPermissions } from '../../lib/order-permissions';
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
  const [permissions, setPermissions] = useState(() => orderPermissions(''));
  const [loading, setLoading] = useState(true);
  const [pendingReady, setPendingReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [tab, setTab] = useState<'PENDING' | 'ENTRY' | 'HISTORY'>('PENDING');
  const [history, setHistory] = useState<Transfer[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [message, setMessage] = useState('');
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [entry, setEntry] = useState({ accountId: '', amount: '', counterpartyName: '', referenceNumber: '', description: '' });
  const { transfers: canView, createTransfer: canEnter, approveTransfer: canApprove, transferHistory: canHistory } = permissions;

  const load = async (confirmation = '') => {
    setLoading(true);setPendingReady(false);setHistoryReady(false);
    try {
      const me = await api<User>('/auth/me');
      const profile = me.user.role === 'ADMIN'
        ? await api<{ configured: boolean; grants: string[] | null }>('/admin/access/me') : undefined;
      const access = orderPermissions(me.user.role, profile);
      setPermissions(access);
      if (!access.transfers) { setMessage('Havale İşlemlerini Görüntüleme Yetkiniz Yok.'); return; }
      const [pending, accountList, movements] = await Promise.allSettled([
        api<Collection[]>('/admin/finance/pending-collections'),
        access.createTransfer ? api<Account[]>('/admin/finance/accounts') : Promise.resolve([] as Account[]),
        access.transferHistory ? api<Transfer[]>('/admin/finance/transactions') : Promise.resolve([] as Transfer[]),
      ]);
      setItems(pending.status === 'fulfilled' ? pending.value : []);
      setPendingReady(pending.status === 'fulfilled');
      const active = accountList.status === 'fulfilled' ? accountList.value.filter(item => item.is_active) : [];
      setAccounts(active);
      setEntry(current => ({ ...current, accountId: active.some(item => item.id === current.accountId) ? current.accountId : active[0]?.id ?? '' }));
      setHistory(movements.status === 'fulfilled' ? movements.value.filter(item => item.kind === 'COLLECTION') : []);
      setHistoryReady(access.transferHistory && movements.status === 'fulfilled');
      const failures = [pending, accountList, movements].flatMap((result, index) =>
        result.status === 'rejected' ? [['Bekleyen Havaleler', 'Banka Hesapları', 'Havale Geçmişi'][index]] : []);
      setMessage([confirmation, failures.length ? failures.join(', ') + ' Yüklenemedi. Sayfayı Yenileyin.' : ''].filter(Boolean).join(' '));
    } catch (error) {
      setPermissions(orderPermissions(''));
      setMessage([confirmation, error instanceof Error ? error.message : 'Havale Kayıtları Yüklenemedi.'].filter(Boolean).join(' '));
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const sync = () => { if (window.location.hash === '#giris') setTab('ENTRY'); }; sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
  useEffect(() => { if (!loading && ((tab === 'ENTRY' && !canEnter) || (tab === 'HISTORY' && !canHistory))) setTab('PENDING'); }, [loading, canEnter, canHistory, tab]);
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
    event.preventDefault(); if (actionLock.current || !canApprove || loading) return; const orderId = orders[id]?.trim();
    if (!orderId) { setMessage('Sipariş numarası veya sipariş kimliği girin.'); return; }
    actionLock.current = true;
    setBusy(true);
    try {
      await api(`/admin/finance/collections/${id}/approve`, { method: 'POST', body: JSON.stringify({ orderId }) });
      await load('Havale Onaylandı Ve Siparişle Eşleştirildi.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Onaylanamadı.'); }
    finally { actionLock.current = false;setBusy(false); }
  }

  async function addCollection(event: FormEvent) {
    event.preventDefault();
    if (actionLock.current || !canEnter || loading) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await api('/admin/finance/transactions', { method: 'POST', body: JSON.stringify({
        accountId: entry.accountId, kind: 'COLLECTION', amount: Number(entry.amount), paymentStatus: 'PENDING',
        counterpartyName: entry.counterpartyName || undefined, referenceNumber: entry.referenceNumber || undefined,
        description: entry.description,
      }) });
      setEntry((current) => JSON.stringify(current)===JSON.stringify(entry)?{ ...current, amount: '', counterpartyName: '', referenceNumber: '', description: '' }:current);
      await load('Gelen Havale Kaydedildi. Eşleştirme Ve Onay İçin Hazır.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Havale kaydedilemedi.'); }
    finally { actionLock.current = false;setBusy(false); }
  }

  return <main><AdminNav /><section>
    <p>SİPARİŞLER / HAVALE EŞLEŞTİRME</p><h1>Havale İşlemleri</h1>
    <p>Gelen Havaleleri Verilen Yetkilere Göre Kaydedin, Görüntüleyin Ve Siparişlerle Eşleştirin.</p>
    {selectedOrder && <p className="selected-order">Onay için seçilen sipariş: <strong>{selectedOrder}</strong>. Aşağıdan ilgili gelen havaleyi seçip eşleştirin.</p>}
    <div className="button-row"><Link href="/siparisler">← Siparişlere Dön</Link><button type="button" className="secondary" disabled={loading||busy} onClick={()=>void load()}>{loading?'Yükleniyor…':'Havale Bilgilerini Yenile'}</button></div>{message && <p role="status">{message}</p>}
    <div className="period-toolbar" role="tablist" aria-label="Havale İşlemleri"><button type="button" role="tab" aria-selected={tab === 'PENDING'} onClick={() => setTab('PENDING')}>Bekleyen Havale Eşleştirme</button>{canEnter && <button type="button" role="tab" aria-selected={tab === 'ENTRY'} onClick={() => setTab('ENTRY')}>Gelen Havale Girişi</button>}{canHistory && <button type="button" role="tab" aria-selected={tab === 'HISTORY'} onClick={() => setTab('HISTORY')}>Gelen Havale Geçmişi</button>}</div>{canEnter && tab === 'ENTRY' && <form id="giris" className="transfer-entry" onSubmit={addCollection}><div className="transfer-entry-head"><h2>Hesaba gelen havale girişi</h2><p>Havale kaydedilince aşağıdaki bekleyen kayıtlar arasına eklenir.</p></div><div className="transfer-entry-grid">
      <label>Banka / kasa hesabı<select required value={entry.accountId} onChange={(event) => setEntry((current) => ({ ...current, accountId: event.target.value }))}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
      <label>Tutar<input required min="0.01" step="0.01" type="number" value={entry.amount} onChange={(event) => setEntry((current) => ({ ...current, amount: event.target.value }))} /></label>
      <label>Gönderen adı<input value={entry.counterpartyName} onChange={(event) => setEntry((current) => ({ ...current, counterpartyName: event.target.value }))} /></label>
      <label>Dekont / banka referansı<input value={entry.referenceNumber} onChange={(event) => setEntry((current) => ({ ...current, referenceNumber: event.target.value }))} /></label>
      <label>Açıklama<input required value={entry.description} placeholder="Örn. müşteri havalesi" onChange={(event) => setEntry((current) => ({ ...current, description: event.target.value }))} /></label>
      <button disabled={busy || loading || !accounts.length}>{busy ? 'Kaydediliyor…' : 'Bekleyen Havaleyi Kaydet'}</button>
    </div></form>}
    {canView && tab !== 'ENTRY' && <><div className="period-toolbar"><h2>{tab === 'HISTORY' ? 'Gelen Havale Geçmişi' : 'Bekleyen Havale Kayıtları'}</h2><label>Başlangıç<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>Bitiş<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>{(dateFrom || dateTo) && <button type="button" className="secondary" onClick={() => { setDateFrom(''); setDateTo(''); }}>Tarihi Temizle</button>}<button type="button" disabled={loading || !reportItems.length || (tab === 'HISTORY' && !historyReady)} onClick={exportCollections}>Excel&apos;e Aktar</button></div>
    {dateFrom && dateTo && dateFrom > dateTo && <p role="alert">Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz.</p>}<div className="cards">{financeTotals(reportItems).map(total => <article key={total.currency}><p>Toplam Havale · {total.currency}</p><strong>{money(String(total.amount), total.currency)}</strong></article>)}</div>{tab === 'HISTORY' ? <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Tarih</th><th>Banka Hesabı</th><th>Gönderen</th><th>Tutar</th><th>Durum</th><th>İlgili Sipariş</th><th>Dekont / Referans</th><th>Açıklama</th></tr></thead><tbody>{shownHistory.map(item => <tr key={item.id}><td>{financeDateTime(item.occurred_at)}</td><td>{item.account_name}</td><td>{item.counterparty_name ?? '—'}</td><td>{money(item.amount, item.currency)}</td><td>{statusLabels[item.payment_status ?? ''] ?? item.payment_status ?? 'Belirtilmemiş'}</td><td>{item.order_number ? <Link href={`/siparisler/${item.order_id}`}>{item.order_number}</Link> : '—'}</td><td>{item.reference_number ?? '—'}</td><td>{item.description}</td></tr>)}</tbody></table>{!shownHistory.length && <p className="empty-state">{loading?'Havale Geçmişi Yükleniyor…':historyReady ? 'Bu Tarih Aralığında Havale Yok.' : 'Havale Geçmişi Yüklenemedi.'}</p>}</div></div> : <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Tarih</th><th>Hesap</th><th>Gönderen</th><th>Tutar</th><th>Dekont / Referans</th><th>Açıklama</th><th>Siparişle Eşleştir</th></tr></thead><tbody>{shownItems.map(item => <tr key={item.id}><td>{financeDateTime(item.occurred_at)}</td><td>{item.account_name}</td><td>{item.counterparty_name ?? '—'}</td><td>{money(item.amount, item.currency)}</td><td>{item.reference_number ?? '—'}</td><td>{item.description}</td><td>{canApprove ? <form onSubmit={event => approve(event, item.id)}><label>Sipariş Numarası<input required placeholder="Örn. TRX-10025" value={orders[item.id] ?? ''} onChange={event => setOrders(value => ({...value, [item.id]: event.target.value}))}/></label><button disabled={busy || loading}>{busy ? 'İşleniyor…' : 'Havaleyi Eşleştir Ve Onayla'}</button></form> : 'Onay Yetkisi Yok'}</td></tr>)}</tbody></table>{!shownItems.length && <p className="empty-state">{loading ? 'Yükleniyor…' : !pendingReady ? 'Bekleyen Havaleler Yüklenemedi.' : 'Bu Tarih Aralığında Bekleyen Havale Yok.'}</p>}</div></div>}</>}
  </section></main>;
}

export default function Collections() {
  return <Suspense fallback={<main><AdminNav /><section><p>Havale ekranı hazırlanıyor…</p></section></main>}><CollectionsContent /></Suspense>;
}
