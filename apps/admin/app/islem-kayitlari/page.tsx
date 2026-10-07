'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';

type Entry = { id: string; action: string; entity_type: string; entity_id: string | null; created_at: string; actor_role: string | null; actor_user_id: string | null };
type Result = { items: Entry[]; page: number; hasMore: boolean };
const roles: Record<string, string> = { SYSTEM: 'Sistem', SUPER_ADMIN: 'Sistem yöneticisi', ADMIN: 'Yönetici', WAREHOUSE: 'Depo', FINANCE: 'Finans', CUSTOMER: 'Müşteri', DEALER: 'Bayi' };
export default function AuditPage() {
  const [filter, setFilter] = useState({ action: '', entityType: '', entityId: '' });
  const [applied, setApplied] = useState(filter);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const ticket = ++sequence.current;
    setLoading(true); setError(''); setResult(null);
    const query = new URLSearchParams({ page: String(page) });
    for (const [key, value] of Object.entries(applied)) if (value.trim()) query.set(key, value.trim());
    api<Result>(`/admin/audit-logs?${query}`).then(data => { if (sequence.current === ticket) setResult(data); })
      .catch(e => { if (sequence.current === ticket) setError(e instanceof Error ? e.message : 'Kayıtlar yüklenemedi'); })
      .finally(() => { if (sequence.current === ticket) setLoading(false); });
    return () => { sequence.current++; };
  }, [page, applied, refresh]);
  function search(event: FormEvent) { event.preventDefault(); setPage(1); setApplied({ ...filter }); }
  return <main><AdminNav /><section>
    <p>AYARLAR / DENETİM</p><h1>İşlem kayıtları</h1>
    <p>Kayıtlar salt okunurdur. İşlem kodu, kayıt türü ve kayıt kimliği tam eşleşmeyle filtrelenir. Hassas müşteri bilgileri ve şifreler bu listede gösterilmez.</p>
    <form className="form-card" onSubmit={search}><div className="form-grid">
      <label>İşlem kodu<input maxLength={120} placeholder="order.admin.updated" value={filter.action} onChange={e => setFilter(x => ({ ...x, action: e.target.value }))} /></label>
      <label>Kayıt türü<input maxLength={120} placeholder="order" value={filter.entityType} onChange={e => setFilter(x => ({ ...x, entityType: e.target.value }))} /></label>
      <label>Kayıt kimliği<input maxLength={200} value={filter.entityId} onChange={e => setFilter(x => ({ ...x, entityId: e.target.value }))} /></label>
    </div><button disabled={loading}>Filtrele</button><button type="button" className="secondary" disabled={loading} onClick={() => setRefresh(x => x + 1)}>Yenile</button></form>
    {loading && <p role="status">Kayıtlar yükleniyor…</p>}{error && <p role="alert">{error}</p>}
    {result && <><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Tarih</th><th>İşlem kodu</th><th>Kayıt türü</th><th>Kayıt kimliği</th><th>İşlemi yapan</th></tr></thead><tbody>{result.items.map(entry => <tr key={entry.id}>
      <td>{new Date(entry.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</td><td>{entry.action}</td><td>{entry.entity_type}</td><td>{entry.entity_id ?? '—'}</td><td>{roles[entry.actor_role ?? ''] ?? 'Bilinmiyor'}{entry.actor_user_id && <small style={{ display: 'block' }}>{entry.actor_user_id}</small>}</td>
    </tr>)}</tbody></table></div>{!result.items.length && <p>Bu filtrelerde işlem kaydı bulunamadı.</p>}
      <p>Sayfa {result.page} · {result.items.length} kayıt</p><button disabled={loading || page === 1} onClick={() => setPage(x => x - 1)}>Önceki</button><button disabled={loading || !result.hasMore} onClick={() => setPage(x => x + 1)}>Sonraki</button></>}
  </section></main>;
}
