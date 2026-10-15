'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';

type Item = { id: string; channel: string; recipient: string; subject: string | null; body: string; status: string; created_at: string; attempt_count?: number; failure_reason?: string | null };
const csv = (value: string) => `"${value.replaceAll('"', '""')}"`;
const channelLabels: Record<string, string> = { IN_APP: 'Uygulama içi', EMAIL: 'E-posta', SMS: 'SMS', PUSH: 'Push' };

export default function Notifications() {
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [form, setForm] = useState({ channel: 'IN_APP', recipient: 'Yönetim', subject: '', body: '' });
  const load = () => api<Item[]>('/admin/notifications').then(setItems).catch(error => setMessage(error instanceof Error ? error.message : 'Bildirimler yüklenemedi.'));
  useEffect(() => { void load(); }, []);
  const shown = useMemo(() => items.filter(item => (channel === 'ALL' || item.channel === channel) && (statusFilter === 'ALL' || item.status === statusFilter) && [item.recipient, item.subject, item.body, item.status].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))), [items, query, channel, statusFilter]);
  async function submit(event: FormEvent) { event.preventDefault(); try { await api('/admin/notifications', { method: 'POST', body: JSON.stringify({ ...form, subject: form.subject || undefined }) }); setForm({ channel: 'IN_APP', recipient: 'Yönetim', subject: '', body: '' }); setMessage('Bildirim kaydedildi. Gerçek SMS/e-posta hesabı bağlanana kadar test sağlayıcısı kullanılır.'); void load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gönderilemedi'); } }
  async function retry(id: string) { try { await api(`/admin/notifications/${id}/retry`, { method: 'POST' }); setMessage('Bildirim tekrar kuyruğa alındı.'); void load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Yeniden deneme başlatılamadı'); } }
  function exportNotifications() { if (!shown.length) { setMessage('Dışa aktarılacak bildirim bulunamadı.'); return; } const rows = [['Tarih', 'Kanal', 'Durum', 'Alıcı', 'Başlık', 'Mesaj'], ...shown.map(item => [new Date(item.created_at).toLocaleString('tr-TR'), channelLabels[item.channel] ?? item.channel, item.status, item.recipient, item.subject ?? '', item.body])]; const url = URL.createObjectURL(new Blob([`\uFEFF${rows.map(row => row.map(csv).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8;' })); const link = document.createElement('a'); link.href = url; link.download = 'trex-bildirimler.csv'; link.click(); URL.revokeObjectURL(url); }
  return <main><AdminNav /><section>
    <p>BİLDİRİM MERKEZİ</p><h1>Bildirimler</h1>
    <div className="cards"><article><p>TOPLAM</p><h2>{items.length}</h2></article><article><p>GÖSTERİLEN</p><h2>{shown.length}</h2></article><article><p>GÖNDERİLEN</p><h2>{items.filter(item => item.status === 'SENT').length}</h2></article><article><p>BAŞARISIZ</p><h2>{items.filter(item => item.status === 'FAILED').length}</h2></article></div>
    <form className="form-card" onSubmit={submit}><div className="form-grid"><label>Kanal<select value={form.channel} onChange={event => setForm(current => ({ ...current, channel: event.target.value }))}><option value="IN_APP">Uygulama içi</option><option value="EMAIL">E-posta</option><option value="SMS">SMS</option><option value="PUSH">Push</option></select></label><label>Alıcı<input required value={form.recipient} onChange={event => setForm(current => ({ ...current, recipient: event.target.value }))} /></label><label>Başlık<input value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} /></label><label className="wide">Mesaj<textarea required value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} /></label></div><button>Bildirimi oluştur</button></form>
    {message && <p role="status">{message}</p>}
    <div className="period-toolbar"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Alıcı, başlık veya mesaj ara" /><select value={channel} onChange={event => setChannel(event.target.value)}><option value="ALL">Tüm kanallar</option><option value="IN_APP">Uygulama içi</option><option value="EMAIL">E-posta</option><option value="SMS">SMS</option><option value="PUSH">Push</option></select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">Tüm durumlar</option><option value="SENT">Gönderilen</option><option value="FAILED">Başarısız</option><option value="PENDING">Bekleyen</option></select><button type="button" disabled={!shown.length} onClick={exportNotifications}>CSV indir</button></div>
    <div className="cards">{shown.length ? shown.map(item => <article key={item.id}><p>{channelLabels[item.channel] ?? item.channel} · {item.status}</p><h2>{item.subject ?? 'Başlıksız bildirim'}</h2><p>{item.body}</p><p>{item.recipient} · {new Date(item.created_at).toLocaleString('tr-TR')}</p>{item.attempt_count ? <p>Deneme: {item.attempt_count}</p> : null}{item.failure_reason ? <p>Hata: {item.failure_reason}</p> : null}{item.status === 'FAILED' ? <button type="button" onClick={() => void retry(item.id)}>Tekrar dene</button> : null}</article>) : <article><p>Bu filtrelerde bildirim yok.</p></article>}</div>
  </section></main>;
}
