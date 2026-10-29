'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsx';

type Account = { id: string; name: string; account_type: string; currency: string };
type Transaction = { id: string; account_name: string; currency: string; kind: string; amount: string; expense_category: string | null; cost_center: string | null; counterparty_name: string | null; reference_number: string | null; document_url: string | null; description: string; occurred_at: string };
const categories = ['Kargo', 'Reklam', 'Personel', 'Prim', 'Kira', 'Yazılım', 'Pazar yeri komisyonu', 'Tedarik', 'Vergi', 'Diğer'];
const money = (value: string, currency: string) => Number(value).toLocaleString('tr-TR', { style: 'currency', currency });

export default function ExpensesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState({ accountId: '', amount: '', expenseCategory: 'Kargo', costCenter: '', counterpartyName: '', referenceNumber: '', documentUrl: '', description: '' });
  const load = () => Promise.all([api<Account[]>('/admin/finance/accounts'), api<Transaction[]>('/admin/finance/transactions')]).then(([loaded, items]) => { setAccounts(loaded); setTransactions(items); if (loaded[0]) setForm(current => current.accountId ? current : { ...current, accountId: loaded[0].id }); }).catch(error => setMessage(error instanceof Error ? error.message : 'Masraf kayıtları yüklenemedi.'));
  useEffect(() => { void load(); }, []);
  async function deleteExpense(id: string) {
    if (!window.confirm('Bu Masraf Kaydı Silinsin Mi?')) return;
    try {
      await api(`/admin/finance/transactions/${id}`, { method: 'DELETE' });
      setMessage('Masraf Kaydı Silindi.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Masraf Silinemedi.'); }
  }
  const expenses = useMemo(() => transactions.filter(item => item.kind === 'EXPENSE').filter(item => [item.expense_category, item.cost_center, item.counterparty_name, item.description, item.reference_number].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))).filter(item => { const date = item.occurred_at.slice(0, 10); return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo); }), [transactions, query, dateFrom, dateTo]);
  async function submit(event: FormEvent) { event.preventDefault(); try { await api('/admin/finance/transactions', { method: 'POST', body: JSON.stringify({ ...form, kind: 'EXPENSE', amount: Number(form.amount), paymentStatus: 'PAID', counterpartyName: form.counterpartyName || undefined, referenceNumber: form.referenceNumber || undefined, documentUrl: form.documentUrl || undefined, costCenter: form.costCenter || undefined }) }); setMessage('Masraf kaydedildi.'); setForm(current => ({ ...current, amount: '', counterpartyName: '', referenceNumber: '', documentUrl: '', description: '' })); void load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Kaydedilemedi'); } }
  function exportExpenses() { if (!expenses.length) { setMessage('Dışa aktarılacak masraf bulunamadı.'); return; } const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0); const rows = [['Tarih', 'Kategori', 'Masraf Merkezi', 'Hesap', 'Para Birimi', 'Tutar', 'Firma / Kişi', 'Referans No', 'Açıklama'], ...expenses.map(item => [new Date(item.occurred_at).toLocaleString('tr-TR'), item.expense_category ?? 'Masraf', item.cost_center ?? '', item.account_name, item.currency, item.amount, item.counterparty_name ?? '', item.reference_number ?? '', item.description]), ['', '', '', '', 'Toplam', total.toFixed(2), '', '', '']]; downloadXlsx('trex-masraflar.xlsx', 'Masraflar', rows); }
  return <main><AdminNav /><section className="expense-workspace">
    <p>FİNANS / MASRAFLAR</p><h1>Masraf girişi</h1><p>Masrafı hangi hesaptan çıktığını, kategorisini ve belge bilgisini girerek kaydedin.</p>{message && <p role="status">{message}</p>}
    <form className="form-card" onSubmit={submit}><div className="form-grid">
      <label>Çıkış hesabı<select required value={form.accountId} onChange={event => setForm(current => ({ ...current, accountId: event.target.value }))}><option value="">Seçin</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
      <label>Masraf kategorisi<input required list="expense-categories" value={form.expenseCategory} placeholder="Kategori yazın veya seçin" onChange={event => setForm(current => ({ ...current, expenseCategory: event.target.value }))} /><datalist id="expense-categories">{categories.map(category => <option key={category} value={category} />)}</datalist><small>Listeden seçebilir veya yeni bir kategori yazabilirsiniz.</small></label>
      <label>Tutar<input required min="0.01" step="0.01" type="number" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></label>
      <label>Masraf merkezi<input value={form.costCenter} placeholder="Depo, satış, yönetim..." onChange={event => setForm(current => ({ ...current, costCenter: event.target.value }))} /></label>
      <label>Firma / kişi<input value={form.counterpartyName} onChange={event => setForm(current => ({ ...current, counterpartyName: event.target.value }))} /></label>
      <label>Dekont / fatura no<input value={form.referenceNumber} onChange={event => setForm(current => ({ ...current, referenceNumber: event.target.value }))} /></label>
      <label className="wide">Belge bağlantısı<input value={form.documentUrl} placeholder="Belge için erişilebilir bağlantı (isteğe bağlı)" onChange={event => setForm(current => ({ ...current, documentUrl: event.target.value }))} /></label>
      <label className="wide">Açıklama<textarea required value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label>
    </div><button>Masrafı kaydet</button></form>
    <div className="period-toolbar"><h2>Masraf geçmişi</h2><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Kategori, masraf merkezi veya firma ara" /><label>Başlangıç<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label><label>Bitiş<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>{(dateFrom || dateTo) && <button type="button" className="secondary" onClick={() => { setDateFrom(''); setDateTo(''); }}>Tarihi temizle</button>}<button type="button" disabled={!expenses.length} onClick={exportExpenses}>Excel&apos;e Aktar</button></div>
    <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Tarih</th><th>Kategori</th><th>Departman</th><th>Hesap</th><th>Firma / Kişi</th><th>Açıklama</th><th>Tutar</th><th>Belge / Referans</th><th>İşlemler</th></tr></thead><tbody>{expenses.map(item => <tr key={item.id}><td>{new Date(item.occurred_at).toLocaleDateString('tr-TR')}</td><td>{item.expense_category ?? '—'}</td><td>{item.cost_center ?? '—'}</td><td>{item.account_name}</td><td>{item.counterparty_name ?? '—'}</td><td>{item.description}</td><td><strong>{money(item.amount, item.currency)}</strong></td><td>{item.reference_number ?? '—'}{item.document_url && <a href={item.document_url} target="_blank" rel="noopener noreferrer"> · Belgeyi Aç</a>}</td><td><button className="secondary" type="button" onClick={() => void deleteExpense(item.id)}>Masrafı Sil</button></td></tr>)}</tbody></table>{!expenses.length && <p className="empty-state">Bu Filtrede Masraf Kaydı Yok.</p>}</div></div>
  </section></main>;
}
