'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';

type Collection = { id: string; account_name: string; currency: string; amount: string; counterparty_name: string | null; reference_number: string | null; description: string; occurred_at: string };
type Account = { id: string; name: string; currency: string; is_active: boolean };
type User = { user: { role: string } };
const money = (amount: string, currency: string) => Number(amount).toLocaleString('tr-TR', { style: 'currency', currency });

function CollectionsContent() {
  const searchParams = useSearchParams();
  const selectedOrder = searchParams.get('order')?.trim() ?? '';
  const [items, setItems] = useState<Collection[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('');
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [entry, setEntry] = useState({ accountId: '', amount: '', counterpartyName: '', referenceNumber: '', description: '' });
  const isOwner = role === 'SUPER_ADMIN';

  const load = async () => {
    try {
      const [collections, me] = await Promise.all([api<Collection[]>('/admin/finance/pending-collections'), api<User>('/auth/me')]);
      setItems(collections); setRole(me.user.role);
      if (me.user.role === 'SUPER_ADMIN') {
        const list = await api<Account[]>('/admin/finance/accounts');
        const active = list.filter((item) => item.is_active);
        setAccounts(active);
        if (!entry.accountId && active[0]) setEntry((current) => ({ ...current, accountId: active[0].id }));
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Havale kayıtları yüklenemedi.'); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (selectedOrder && items.length) {
      setOrders((current) => Object.fromEntries(items.map((item) => [item.id, current[item.id] || selectedOrder])));
    }
  }, [items, selectedOrder]);

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
    <p>SİPARİŞLER / HAVALE EŞLEŞTİRME</p><h1>Bekleyen havaleler</h1>
    <p>{isOwner ? 'Gelen tutarı girin; yönetici veya ana yönetici siparişle eşleştirip onaylayabilir.' : 'Bekleyen havaleleri sipariş numarasıyla eşleştirip onaylayabilirsiniz. Para hareketi ve hesap yönetimi yalnız ana yöneticidedir.'}</p>
    {selectedOrder && <p className="selected-order">Onay için seçilen sipariş: <strong>{selectedOrder}</strong>. Aşağıdan ilgili gelen havaleyi seçip eşleştirin.</p>}
    <p><Link href="/siparisler">← Siparişlere dön</Link></p>{message && <p role="status">{message}</p>}
    {isOwner && <form className="transfer-entry" onSubmit={addCollection}><div className="transfer-entry-head"><h2>Hesaba gelen havale girişi</h2><p>Havale kaydedilince aşağıdaki bekleyen kayıtlar arasına eklenir.</p></div><div className="transfer-entry-grid">
      <label>Banka / kasa hesabı<select required value={entry.accountId} onChange={(event) => setEntry((current) => ({ ...current, accountId: event.target.value }))}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
      <label>Tutar<input required min="0.01" step="0.01" type="number" value={entry.amount} onChange={(event) => setEntry((current) => ({ ...current, amount: event.target.value }))} /></label>
      <label>Gönderen adı<input value={entry.counterpartyName} onChange={(event) => setEntry((current) => ({ ...current, counterpartyName: event.target.value }))} /></label>
      <label>Dekont / banka referansı<input value={entry.referenceNumber} onChange={(event) => setEntry((current) => ({ ...current, referenceNumber: event.target.value }))} /></label>
      <label>Açıklama<input required value={entry.description} placeholder="Örn. müşteri havalesi" onChange={(event) => setEntry((current) => ({ ...current, description: event.target.value }))} /></label>
      <button>Bekleyen havaleyi kaydet</button>
    </div></form>}
    <div className="collection-list">{items.length ? items.map((item) => <article className="collection-row" key={item.id}><div><p>Hesap</p><strong>{item.account_name}</strong><small>{new Date(item.occurred_at).toLocaleString('tr-TR')}</small></div><div><p>Gelen tutar</p><h2>{money(item.amount, item.currency)}</h2></div><div><p>Gönderen</p><strong>{item.counterparty_name ?? 'Bilinmiyor'}</strong><small>Dekont: {item.reference_number ?? 'Yok'}</small></div><div><p>Açıklama</p><strong>{item.description}</strong></div><form onSubmit={(event) => approve(event, item.id)}><label>Eşleştirilecek sipariş<input required placeholder="Örn. TRX-10025" value={orders[item.id] ?? ''} onChange={(event) => setOrders((value) => ({ ...value, [item.id]: event.target.value }))} /></label><button>Havaleyi eşleştir ve siparişi onayla</button></form></article>) : <article className="collection-row"><p>Onay bekleyen havale yok.</p></article>}</div>
  </section></main>;
}

export default function Collections() {
  return <Suspense fallback={<main><AdminNav /><section><p>Havale ekranı hazırlanıyor…</p></section></main>}><CollectionsContent /></Suspense>;
}
