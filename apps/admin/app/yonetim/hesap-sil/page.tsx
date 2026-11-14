'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import styles from '../../components/removal.module.css';
import { api } from '../../lib/api';
import { financeDateTime } from '../../lib/finance-report';

type Account = {
  id: string;
  name: string;
  kind: 'staff' | 'dealer';
  archived_at: string | null;
};

const endpoint = '/admin/account-archives';

export default function AccountArchives() {
  const [rows, setRows] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Account | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [kind, setKind] = useState<Account['kind']>('staff');
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const lock = useRef(false);
  const confirmHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let current = true;
    setKind(new URLSearchParams(window.location.search).get('kind') === 'dealer' ? 'dealer' : 'staff');
    void api<{ user: { role: string } }>('/auth/me').then(async ({ user }) => {
      if (!current) return;
      if (user.role !== 'SUPER_ADMIN') throw new Error('Bu alanı yalnız Müdür kullanabilir.');
      const accounts = await api<Account[]>(endpoint);
      if (current) {
        setRows(accounts);
        setAllowed(true);
      }
    }).catch(error => {
      if (current) setMessage(error instanceof Error ? error.message : 'Hesaplar yüklenemedi.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, []);

  useEffect(() => { if (selected) confirmHeading.current?.focus(); }, [selected]);

  async function save() {
    if (!selected || lock.current) return;
    const restore = Boolean(selected.archived_at);
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await api(endpoint + '/' + selected.kind + '/' + selected.id, {
        method: 'POST',
        body: JSON.stringify({ isActive: restore }),
      });
      setSelected(null);
      const confirmation = restore
        ? 'Hesap listeye geri alındı. Giriş için yeniden etkinleştirin.'
        : 'Hesap listeden kaldırıldı ve oturumları kapatıldı.';
      try {
        setRows(await api<Account[]>(endpoint));
        setMessage(confirmation);
      } catch {
        setRows(current => current.filter(row => row.id !== selected.id || row.kind !== selected.kind));
        setMessage(confirmation + ' Güncel hesap listesini görmek için sayfayı yenileyin.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  const accountLabel = kind === 'dealer' ? 'Bayi' : 'Yönetici';
  const query = search.trim().toLocaleLowerCase('tr-TR');
  const visible = rows.filter(row => row.kind === kind && Boolean(row.archived_at) === archived &&
    row.name.toLocaleLowerCase('tr-TR').includes(query));

  return <main className={styles.page}>
    <AdminNav />
    <section>
      <Link className={styles.back} href={kind === 'dealer' ? '/bayiler' : '/personel'}>← {kind === 'dealer' ? 'Bayiler' : 'Personel'}</Link>
      <h1>{accountLabel} Hesapları</h1>
      {message && <p className="notice" role="status">{message}</p>}
      {loading && <p role="status">Hesaplar yükleniyor…</p>}
      {allowed && !loading && <>
        <div className={styles.toolbar}>
          <button type="button" disabled={busy} aria-pressed={kind === 'staff'} onClick={() => { setKind('staff'); setSelected(null); }}>Yöneticiler</button>
          <button type="button" disabled={busy} aria-pressed={kind === 'dealer'} onClick={() => { setKind('dealer'); setSelected(null); }}>Bayiler</button>
          <button type="button" disabled={busy} aria-pressed={archived} onClick={() => { setArchived(!archived); setSelected(null); }}>{archived ? 'Kayıtlı Hesapları Göster' : 'Silinenleri Göster'}</button>
          <input aria-label="Hesap ara" placeholder="Hesap ara" value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        {selected && <section className="form-card" aria-labelledby="archive-action">
          <h2 id="archive-action" tabIndex={-1} ref={confirmHeading}>{selected.archived_at ? 'Hesabı geri al' : 'Hesabı sil'} · {selected.name}</h2>
          <p>{selected.archived_at ? 'Hesap listeye döner. Giriş için ayrıca etkinleştirme gerekir.' : 'Hesabın açık oturumları kapatılır. Sipariş, prim ve finans geçmişi saklanır.'}</p>
          <div className="button-row">
            <button type="button" disabled={busy} className={selected.archived_at ? undefined : styles.danger} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : selected.archived_at ? 'Geri Almayı Onayla' : 'Silmeyi Onayla'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setSelected(null)}>Vazgeç</button>
          </div>
        </section>}
        <section className="table-card">
          <h2>{archived ? 'Silinen Hesaplar' : 'Kayıtlı Hesaplar'} ({visible.length})</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Hesap</th><th scope="col">Durum</th><th scope="col">İşlem</th></tr></thead>
              <tbody>
                {visible.map(row => <tr key={row.kind + row.id}>
                  <td>{row.name}</td>
                  <td>{row.archived_at ? 'Silindi · ' + financeDateTime(row.archived_at) : 'Kayıtlı'}</td>
                  <td><button type="button" disabled={busy} className={row.archived_at ? 'secondary' : styles.danger} onClick={() => setSelected(row)}>{row.archived_at ? 'Geri Al' : 'Sil'}</button></td>
                </tr>)}
                {!visible.length && <tr><td colSpan={3}>Bu görünümde hesap bulunamadı.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </>}
    </section>
  </main>;
}
