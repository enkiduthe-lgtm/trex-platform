"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
import { createActionLock, createRequestGate } from '../lib/async-controls';
import styles from "./customers.module.css";
type Customer = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  order_count: number;
  total_spend: string;
  totals_by_currency: { currency: string; amount: string; order_count: number }[];
  note_count: number;
};
type Note = { id: string; body: string; created_at: string };
const money = (v: string, currency = 'TRY') =>
  Number(v).toLocaleString("tr-TR", { style: "currency", currency });
function CustomerAmounts({ customer }: { customer: Customer }) {
  return <>{customer.totals_by_currency.map(total => <span style={{display:'block'}} key={total.currency}>{money(total.amount, total.currency)} <small>{total.currency}</small></span>)}{!customer.totals_by_currency.length && money('0')}</>;
}
export default function Customers() {
  const [rows, setRows] = useState<Customer[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Customer | null>(null),
    [notes, setNotes] = useState<Note[]>([]),
    [note, setNote] = useState(""),
    [message, setMessage] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const notesGate = useRef(createRequestGate());
  const saveLock = useRef(createActionLock());
  const load = () =>
    api<Customer[]>("/admin/customers")
      .then(data => { setRows(data); setSelected(current => current ? data.find(customer => customer.id === current.id) ?? current : null); })
      .catch((e) =>
        setMessage(e instanceof Error ? e.message : "Müşteriler yüklenemedi."),
      );
  useEffect(() => {
    void load();
    return () => { notesGate.current.invalidate(); };
  }, []);
  const shown = useMemo(
    () =>
      rows.filter((x) =>
        `${x.first_name} ${x.last_name} ${x.email} ${x.phone ?? ""}`
          .toLocaleLowerCase("tr-TR")
          .includes(query.toLocaleLowerCase("tr-TR")),
      ),
    [rows, query],
  );
  const totals = useMemo(() => {
    const amounts = new Map<string, bigint>();
    for (const customer of rows) for (const total of customer.totals_by_currency) {
      const [units, fraction = ''] = total.amount.split('.');
      const cents = BigInt(units) * 100n + BigInt(fraction.padEnd(2, '0'));
      amounts.set(total.currency, (amounts.get(total.currency) ?? 0n) + cents);
    }
    return [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([currency, cents]) => ({ currency, amount: `${cents / 100n}.${String(cents % 100n).padStart(2,'0')}` }));
  }, [rows]);
  async function open(customer: Customer) {
    if (saveLock.current.isLocked()) return;
    await readNotes(customer);
  }
  async function readNotes(customer: Customer) {
    const ticket = notesGate.current.begin();
    setSelected(customer);
    setNote("");
    setNotes([]);
    setNotesLoading(true);
    setMessage('');
    try {
      const result = await api<Note[]>(`/admin/customers/${customer.id}/notes`);
      if (notesGate.current.isCurrent(ticket)) setNotes(result);
    } catch (e) {
      if (notesGate.current.isCurrent(ticket)) setMessage(
        e instanceof Error ? e.message : "Müşteri notları yüklenemedi.",
      );
    } finally {
      if (notesGate.current.isCurrent(ticket)) setNotesLoading(false);
    }
  }
  function close() {
    if (saveLock.current.isLocked()) return;
    notesGate.current.invalidate(); setSelected(null); setNotes([]); setNote(''); setNotesLoading(false);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!selected || notesLoading || !note.trim() || !saveLock.current.acquire()) return;
    setSaving(true); setMessage('');
    try {
      await api(`/admin/customers/${selected.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: note.trim() }),
      });
      setNote("");
      await readNotes(selected);
      setMessage('Not kaydedildi. Liste yüklenemediyse notu yeniden göndermeden müşteriyi tekrar açın.');
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Not kaydedilemedi.");
    } finally {
      saveLock.current.release(); setSaving(false);
    }
  }
  return (
    <main>
      <AdminNav />
      <section className={styles.page}>
        <nav className={styles.subnav}>
          <span className={styles.current}>Müşteriler</span>
          <Link href="/bayiler">Bayiler</Link>
          <Link href="/finans">Cari ve bakiye</Link>
          <Link href="/bildirimler">Bildirim merkezi</Link>
        </nav>
        <div className={styles.heading}>
          <div>
            <p>MÜŞTERİ YÖNETİMİ</p>
            <h1>Müşteriler</h1>
            <span>
              Sipariş tutarları para birimine göre ayrıdır; iptal edilenler hariçtir. Ödeme bekleyenler dahildir, bu tutarlar tahsilat veya ciro değildir.
            </span>
          </div>
          <Link className={styles.action} href="/bayiler">
            Bayi yönetimi →
          </Link>
        </div>
        {message && (
          <p className={styles.notice} role="status">
            {message}
          </p>
        )}
        <div className={styles.metrics}>
          <article>
            <small>Toplam müşteri</small>
            <b>{rows.length}</b>
          </article>
          <article>
            <small>Aktif müşteri</small>
            <b>{rows.filter((x) => x.is_active).length}</b>
          </article>
          <article>
            <small>Sipariş sayısı (iptaller hariç)</small>
            <b>{rows.reduce((n, x) => n + Number(x.order_count || 0), 0)}</b>
          </article>
          <article>
            <small>Sipariş tutarları</small>
            {totals.map(total => <b style={{display:'block'}} key={total.currency}>{money(total.amount,total.currency)} {total.currency}</b>)}
            {!totals.length && <b>{money('0')}</b>}
          </article>
        </div>
        <div className={styles.toolbar}>
          <span>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ad, e-posta veya telefon ara"
          />
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>İletişim</th>
                <th>Sipariş</th>
                <th>Sipariş tutarları</th>
                <th>Notlar</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id}>
                  <td>
                    <b>
                      {x.first_name} {x.last_name}
                    </b>
                    <small>{x.is_active ? "● Aktif" : "● Pasif"}</small>
                  </td>
                  <td>
                    {x.email}
                    <small>{x.phone ?? "Telefon bilgisi yok"}</small>
                  </td>
                  <td>{x.order_count}</td>
                  <td><CustomerAmounts customer={x}/></td>
                  <td>{x.note_count}</td>
                  <td>
                    <button
                      className={styles.rowButton}
                      disabled={saving}
                      onClick={() => void open(x)}
                    >
                      360° aç
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && (
            <p className={styles.empty}>Gösterilecek müşteri bulunamadı.</p>
          )}
        </div>
        {selected && (
          <aside className={styles.drawer}>
            <header>
              <div>
                <small>MÜŞTERİ 360°</small>
                <h2>
                  {selected.first_name} {selected.last_name}
                </h2>
                <span>{selected.email}</span>
              </div>
              <button
                className={styles.close}
                disabled={saving}
                onClick={close}
              >
                ×
              </button>
            </header>
            <div className={styles.stats}>
              <span>
                <b>{selected.order_count}</b>Sipariş
              </span>
              <span>
                <b><CustomerAmounts customer={selected}/></b>Sipariş tutarları
              </span>
              <span>
                <b>{selected.note_count}</b>Not
              </span>
            </div>
            <h3>Personel notları</h3>
            <form onSubmit={save}>
              <textarea
                required
                maxLength={5000}
                disabled={saving || notesLoading}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Bu müşteriyle ilgili iç not ekle"
              />
              <button disabled={saving || notesLoading || !note.trim()}>{saving ? 'Kaydediliyor…' : 'Notu kaydet'}</button>
            </form>
            {notesLoading && <p role="status">Müşteri notları yükleniyor…</p>}
            {notes.map((x) => (
              <article key={x.id}>
                <p>{x.body}</p>
                <small>{new Date(x.created_at).toLocaleString("tr-TR")}</small>
              </article>
            ))}
          </aside>
        )}
      </section>
    </main>
  );
}
