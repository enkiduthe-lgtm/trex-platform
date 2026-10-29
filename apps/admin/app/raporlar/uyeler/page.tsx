'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import { downloadXlsx } from '../../lib/xlsx';
type Member = { id: string; created_at: string; is_active: boolean };
const day = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date(value));
export default function MemberReport() {
  const [items, setItems] = useState<Member[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState('');
  async function load() {
    setBusy(true); setError('');
    try { setItems(await api<Member[]>('/admin/customers')); setLoadedAt(new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Üye Raporu Yüklenemedi.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  const valid = !from || !to || from <= to;
  const rows = useMemo(() => {
    const groups = new Map<string, { day: string; count: number; active: number }>();
    if (!valid) return [];
    for (const item of items) {
      const date = day(item.created_at);
      if ((from && date < from) || (to && date > to)) continue;
      const group = groups.get(date) ?? { day: date, count: 0, active: 0 };
      group.count++; if (item.is_active) group.active++; groups.set(date, group);
    }
    return [...groups.values()].sort((a, b) => b.day.localeCompare(a.day));
  }, [items, from, to, valid]);
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  function exportReport() {
    downloadXlsx('trex-yeni-uye-raporu.xlsx', 'Günlük Yeni Üye Kaydı', [['Başlangıç', from || 'Tüm Tarihler'], ['Bitiş', to || 'Tüm Tarihler'], ['Veri Zamanı', loadedAt], [], ['Kayıt Tarihi', 'Yeni Kayıt Sayısı', 'Şu Anda Aktif', 'Şu Anda Pasif'], ...rows.map(row => [row.day, row.count, row.active, row.count - row.active]), [], ['Toplam Yeni Kayıt', count]]);
  }
  return <main><AdminNav /><section className="finance-workspace"><h1>Günlük Yeni Üye Kaydı</h1><nav className="finance-nav"><Link href="/raporlar">Rapor Merkezi</Link><Link href="/musteriler">Müşteriler</Link></nav><p>Mevcut Müşteri Kayıtlarının Oluşturulma Tarihine Göre Hesaplanır. Aktif / Pasif Sütunları Bugünkü Hesap Durumunu Gösterir.</p><section className="form-card dealer-toolbar"><label>Başlangıç Tarihi<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>Bitiş Tarihi<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label><div className="button-row"><button disabled={busy} onClick={() => void load()}>Raporu Yenile</button><button disabled={busy || !!error || !valid || !rows.length} onClick={exportReport}>Excel&apos;e Aktar</button></div></section>{!valid && <p role="alert">Başlangıç Tarihi Bitiş Tarihinden Sonra Olamaz.</p>}{error && <p role="alert">{error}</p>}<p>Yeni Kayıt Sayısı: {count} · Veri Zamanı: {loadedAt || '—'}</p><section className="table-card" aria-busy={busy}><div className="table-wrap"><table><thead><tr><th>Kayıt Tarihi</th><th>Yeni Kayıt Sayısı</th><th>Şu Anda Aktif</th><th>Şu Anda Pasif</th></tr></thead><tbody>{rows.map(row => <tr key={row.day}><td>{row.day}</td><td>{row.count}</td><td>{row.active}</td><td>{row.count - row.active}</td></tr>)}{!rows.length && <tr><td colSpan={4}>{busy ? 'Yükleniyor…' : 'Seçilen Tarihlerde Kayıt Bulunmuyor.'}</td></tr>}</tbody></table></div></section></section></main>;
}
