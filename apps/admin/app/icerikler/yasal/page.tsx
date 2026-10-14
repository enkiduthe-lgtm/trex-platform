'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';

type Legal = { id: string; code: string; version: string; title: string; is_active: boolean; published_at: string | null; acceptance_count: string };
const empty = { code: '', version: '', title: '', body: '' };
export default function LegalDocumentsPage() {
  const [items, setItems] = useState<Legal[]>([]); const [form, setForm] = useState(empty); const [message, setMessage] = useState('');
  const load = () => api<Legal[]>('/admin/legal-documents').then(setItems).catch(error => setMessage(error instanceof Error ? error.message : 'Yasal dokümanlar yüklenemedi.'));
  useEffect(() => { void load(); }, []);
  async function save(event: FormEvent) { event.preventDefault(); try { await api('/admin/legal-documents', { method: 'POST', body: JSON.stringify(form) }); setForm(empty); setMessage('Taslak yasal metin oluşturuldu. Kontrol ettikten sonra yayınlayabilirsin.'); void load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Kaydedilemedi.'); } }
  async function publish(id: string) { try { await api(`/admin/legal-documents/${id}/publish`, { method: 'POST' }); setMessage('Sürüm yayınlandı. Aynı kodun önceki aktif sürümü pasife alındı.'); void load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Yayınlanamadı.'); } }
  return <main><AdminNav /><section><p>İÇERİKLER / YASAL METİNLER</p><h1>Yasal metin sürümleri</h1><p>KVKK, gizlilik, satış ve teslimat metinlerini sürümleyerek yayınlayın. Aynı doküman kodunda yalnızca bir sürüm aktif kalır.</p>{message && <p role="status">{message}</p>}<form className="form-card" onSubmit={save}><h2>Yeni taslak</h2><div className="form-grid"><label>Doküman kodu<input required placeholder="kvkk-aydinlatma" value={form.code} onChange={e => setForm(x => ({ ...x, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} /></label><label>Sürüm<input required placeholder="2026-10" value={form.version} onChange={e => setForm(x => ({ ...x, version: e.target.value }))} /></label><label className="wide">Başlık<input required value={form.title} onChange={e => setForm(x => ({ ...x, title: e.target.value }))} /></label><label className="wide">Metin<textarea required value={form.body} onChange={e => setForm(x => ({ ...x, body: e.target.value }))} /></label></div><button>Taslak oluştur</button></form><h2>Dokümanlar</h2><div className="cards">{items.length ? items.map(item => <article key={item.id}><p>{item.is_active ? 'AKTİF' : 'TASLAK / ESKİ SÜRÜM'} · Kabul: {item.acceptance_count}</p><h2>{item.title}</h2><p>{item.code} · sürüm {item.version}</p>{!item.is_active && <button type="button" onClick={() => void publish(item.id)}>Bu sürümü yayınla</button>}</article>) : <article><p>Henüz yasal metin eklenmemiş.</p></article>}</div></section></main>;
}
