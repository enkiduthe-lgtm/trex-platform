"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
import { downloadXlsx } from "../lib/xlsx";
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
  loyalty_points: number;
  loyalty_tier: 'BRONZE' | 'SILVER' | 'GOLD';
  tags: CustomerTag[];
};
type CustomerTag = { id: string; name: string; color: string };
type Note = { id: string; body: string; created_at: string };
type Loyalty = { pointsBalance: number; tier: 'BRONZE' | 'SILVER' | 'GOLD'; movements: { id: string; points_delta: number; reason: string; created_at: string }[] };
type CustomerRequest = { id: string; subject: string; body: string; priority: 'LOW'|'NORMAL'|'HIGH'|'URGENT'; status: 'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'; resolution_note: string|null; created_at: string; updated_at: string; };
type CustomerOrder = { id: string; order_number: string; status: string; total_amount: string; currency: string; created_at: string; item_count: number };
type CustomerSupportTicket = { id: string; ticket_number: string; subject: string; status: string; priority: string; due_at: string; created_at: string; order_number: string | null };
type CustomerOrderReportLine = { order_number: string; created_at: string; status: string; currency: string; sales_channel: string; product_name: string; sku: string; quantity: number; unit_amount: string; line_total: string; payment_method: string };
const money = (v: string, currency = 'TRY') =>
  Number(v).toLocaleString("tr-TR", { style: "currency", currency });
const csv = (value: string) => `"${value.replaceAll('"', '""')}"`;
function CustomerAmounts({ customer }: { customer: Customer }) {
  return <>{customer.totals_by_currency.map(total => <span style={{display:'block'}} key={total.currency}>{money(total.amount, total.currency)} <small>{total.currency}</small></span>)}{!customer.totals_by_currency.length && money('0')}</>;
}
export default function Customers() {
  const [rows, setRows] = useState<Customer[]>([]),
    [query, setQuery] = useState(""),
    [tagFilter, setTagFilter] = useState(""),
    [tierFilter, setTierFilter] = useState(""),
    [tags, setTags] = useState<CustomerTag[]>([]),
    [tagName, setTagName] = useState(""),
    [tagColor, setTagColor] = useState("#7c3aed"),
    [selected, setSelected] = useState<Customer | null>(null),
    [notes, setNotes] = useState<Note[]>([]),
    [requests, setRequests] = useState<CustomerRequest[]>([]),
    [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]),
    [supportTickets, setSupportTickets] = useState<CustomerSupportTicket[]>([]),
    [loyalty, setLoyalty] = useState<Loyalty | null>(null),
    [note, setNote] = useState(""),
    [points, setPoints] = useState(""),
    [pointsReason, setPointsReason] = useState(""),
    [requestForm, setRequestForm] = useState({subject:'',body:'',priority:'NORMAL'}),
    [message, setMessage] = useState("");
  const [orderReportFrom, setOrderReportFrom] = useState("");
  const [orderReportTo, setOrderReportTo] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const notesGate = useRef(createRequestGate());
  const saveLock = useRef(createActionLock());
  const load = () =>
    Promise.all([api<Customer[]>("/admin/customers"), api<CustomerTag[]>("/admin/customers/tags")])
      .then(([data, availableTags]) => { setRows(data); setTags(availableTags); setSelected(current => current ? data.find(customer => customer.id === current.id) ?? current : null); })
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
          .includes(query.toLocaleLowerCase("tr-TR")) &&
        (!tagFilter || x.tags.some(tag => tag.id === tagFilter)) &&
        (!tierFilter || x.loyalty_tier === tierFilter),
      ),
    [rows, query, tagFilter, tierFilter],
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
  function exportCustomers() {
    if (!shown.length) { setMessage('Dışa aktarılacak müşteri bulunamadı.'); return; }
    const lines = [
      ['Ad soyad', 'E-posta', 'Telefon', 'Durum', 'Sipariş sayısı', 'Trex puan', 'Seviye', 'Sipariş tutarları', 'Etiketler', 'Kayıt tarihi'],
      ...shown.map(customer => [
        `${customer.first_name} ${customer.last_name}`,
        customer.email,
        customer.phone ?? '',
        customer.is_active ? 'Aktif' : 'Pasif',
        String(customer.order_count ?? 0),
        String(customer.loyalty_points ?? 0),
        customer.loyalty_tier ?? 'BRONZE',
        customer.totals_by_currency.map(total => `${total.amount} ${total.currency}`).join(' | '),
        customer.tags.map(tag => tag.name).join(' | '),
        new Date(customer.created_at).toLocaleString('tr-TR'),
      ]),
    ].map(row => row.map(csv).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${lines}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'trex-musteriler.csv'; link.click(); URL.revokeObjectURL(url);
  }
  async function exportCustomerOrders() {
    if (!selected) return;
    try {
      const params = new URLSearchParams();
      if (orderReportFrom) params.set('dateFrom', orderReportFrom);
      if (orderReportTo) params.set('dateTo', orderReportTo);
      const lines = await api<CustomerOrderReportLine[]>(`/admin/customers/${selected.id}/order-report${params.size ? `?${params}` : ''}`);
      if (!lines.length) { setMessage('Bu tarih aralığında dışa aktarılacak sipariş satırı bulunamadı.'); return; }
      const total = lines.reduce((sum, line) => sum + Number(line.line_total), 0);
      downloadXlsx(`trex-${selected.id}-siparisler.xlsx`, 'Müşteri Siparişleri', [
        ['Sipariş Tarihi', 'Sipariş Numarası', 'Ürün', 'SKU', 'Adet', 'Birim Fiyat', 'Satış Tutarı', 'Para Birimi', 'Ödeme Yöntemi', 'Sipariş Durumu', 'Satış Kanalı'],
        ...lines.map((line) => [new Date(line.created_at).toLocaleString('tr-TR'), line.order_number, line.product_name, line.sku, line.quantity, line.unit_amount, line.line_total, line.currency, line.payment_method || '—', line.status, line.sales_channel]),
        ['', '', '', '', '', 'Toplam', total.toFixed(2), '', '', '', ''],
      ]);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sipariş raporu oluşturulamadı.'); }
  }
  async function open(customer: Customer) {
    if (saveLock.current.isLocked()) return;
    await readNotes(customer);
  }
  async function readNotes(customer: Customer) {
    const ticket = notesGate.current.begin();
    setSelected(customer);
    setNote("");
    setPoints(""); setPointsReason(""); setLoyalty(null); setRequests([]); setCustomerOrders([]); setSupportTickets([]); setRequestForm({subject:'',body:'',priority:'NORMAL'});
    setNotes([]);
    setNotesLoading(true);
    setMessage('');
    try {
      const [result, customerLoyalty, customerRequests, orders, tickets] = await Promise.all([api<Note[]>(`/admin/customers/${customer.id}/notes`),api<Loyalty>(`/admin/customers/${customer.id}/loyalty`),api<CustomerRequest[]>(`/admin/customers/${customer.id}/requests`),api<CustomerOrder[]>(`/admin/customers/${customer.id}/orders`),api<CustomerSupportTicket[]>(`/admin/customers/${customer.id}/support-tickets`)]);
      if (notesGate.current.isCurrent(ticket)) { setNotes(result); setLoyalty(customerLoyalty); setRequests(customerRequests); setCustomerOrders(orders); setSupportTickets(tickets); }
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
    notesGate.current.invalidate(); setSelected(null); setNotes([]); setRequests([]); setCustomerOrders([]); setSupportTickets([]); setLoyalty(null); setNote(''); setPoints(''); setPointsReason(''); setRequestForm({subject:'',body:'',priority:'NORMAL'}); setNotesLoading(false);
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
  async function adjustPoints(e: FormEvent) {
    e.preventDefault();
    const amount = Number(points);
    if (!selected || notesLoading || !Number.isInteger(amount) || !amount || !pointsReason.trim() || !saveLock.current.acquire()) return;
    setSaving(true); setMessage('');
    try {
      await api(`/admin/customers/${selected.id}/loyalty/adjust`, { method: 'POST', body: JSON.stringify({ points: amount, reason: pointsReason.trim() }) });
      setPoints(''); setPointsReason(''); await readNotes(selected); void load(); setMessage('Puan hareketi kaydedildi.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Puan hareketi kaydedilemedi.'); }
    finally { saveLock.current.release(); setSaving(false); }
  }
  async function createRequest(e: FormEvent) {
    e.preventDefault();
    if (!selected || notesLoading || !requestForm.subject.trim() || !requestForm.body.trim() || !saveLock.current.acquire()) return;
    setSaving(true); setMessage('');
    try {
      await api(`/admin/customers/${selected.id}/requests`, { method:'POST', body:JSON.stringify({subject:requestForm.subject.trim(),body:requestForm.body.trim(),priority:requestForm.priority}) });
      setRequestForm({subject:'',body:'',priority:'NORMAL'}); await readNotes(selected); setMessage('Müşteri talebi açıldı.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Talep açılamadı.'); }
    finally { saveLock.current.release(); setSaving(false); }
  }
  async function updateRequest(item: CustomerRequest, status: CustomerRequest['status']) {
    if (!selected || saving || !saveLock.current.acquire()) return;
    setSaving(true); setMessage('');
    try { await api(`/admin/customers/${selected.id}/requests/${item.id}`, { method:'PATCH', body:JSON.stringify({status}) }); await readNotes(selected); setMessage('Talep durumu güncellendi.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Talep güncellenemedi.'); }
    finally { saveLock.current.release(); setSaving(false); }
  }
  async function createTag(e: FormEvent) {
    e.preventDefault();
    if (!tagName.trim() || !saveLock.current.acquire()) return;
    setSaving(true); setMessage('');
    try {
      await api('/admin/customers/tags', { method:'POST', body:JSON.stringify({name:tagName.trim(),color:tagColor}) });
      setTagName(''); await load(); setMessage('Müşteri etiketi oluşturuldu.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Etiket oluşturulamadı.'); }
    finally { saveLock.current.release(); setSaving(false); }
  }
  async function toggleTag(tag: CustomerTag) {
    if (!selected || !saveLock.current.acquire()) return;
    const exists = selected.tags.some(item => item.id === tag.id);
    setSaving(true); setMessage('');
    try {
      await api(`/admin/customers/${selected.id}/tags/${tag.id}`, { method: exists ? 'DELETE' : 'POST' });
      await load(); setMessage(exists ? 'Etiket müşteriden kaldırıldı.' : 'Etiket müşteriye eklendi.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Etiket işlemi tamamlanamadı.'); }
    finally { saveLock.current.release(); setSaving(false); }
  }
  return (
    <main>
      <AdminNav />
      <section className={styles.page}>
        <nav className={styles.subnav}>
          <span className={styles.current}>Üyeler</span>
          <Link href="/bayiler">Bayiler</Link>
          <Link href="/musteriler#etiketler">Müşteri grupları</Link>
          <Link href="/cari">Bakiye yüklemeleri</Link>
          <Link href="/finans/havaleler">Hızlı ödemeler</Link>
          <Link href="/destek?tab=iletisim">İletişim talepleri</Link>
          <Link href="/destek">Müşteri talepleri</Link>
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
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Müşteri etiketi filtresi">
            <option value="">Tüm etiketler</option>
            {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} aria-label="Sadakat seviyesi filtresi">
            <option value="">Tüm sadakat seviyeleri</option>
            <option value="BRONZE">Bronz</option>
            <option value="SILVER">Gümüş</option>
            <option value="GOLD">Altın</option>
          </select>
          <button type="button" className={styles.rowButton} onClick={exportCustomers} disabled={!shown.length}>CSV indir</button>
        </div>
        <form id="etiketler" onSubmit={createTag} className={styles.toolbar} style={{marginTop:12}}>
          <span>🏷</span>
          <input value={tagName} maxLength={80} onChange={(e) => setTagName(e.target.value)} placeholder="Yeni müşteri etiketi" />
          <input aria-label="Etiket rengi" value={tagColor} onChange={(e) => setTagColor(e.target.value)} type="color" style={{maxWidth:52,padding:2}} />
          <button className={styles.rowButton} disabled={saving || !tagName.trim()}>Etiket ekle</button>
        </form>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>İletişim</th>
                <th>Sipariş</th>
                <th>Trex puan</th>
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
                    {!!x.tags.length && <small>{x.tags.map(tag => <span key={tag.id} style={{display:'inline-block',margin:'4px 4px 0 0',padding:'2px 7px',borderRadius:99,color:'#fff',background:tag.color}}>{tag.name}</span>)}</small>}
                  </td>
                  <td>
                    {x.email}
                    <small>{x.phone ?? "Telefon bilgisi yok"}</small>
                  </td>
                  <td>{x.order_count}</td>
                  <td><b>{x.loyalty_points ?? 0}</b><small>{x.loyalty_tier ?? 'BRONZE'}</small></td>
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
              <span>
                <b>{selected.loyalty_points ?? 0}</b>Trex puan
              </span>
            </div>
            <h3>Son siparişler</h3>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end',marginBottom:12,padding:'10px',border:'1px solid #e5e7eb',borderRadius:8}}>
              <label style={{display:'grid',gap:4,fontSize:11}}>Başlangıç Tarihi<input type="date" value={orderReportFrom} onChange={(event) => setOrderReportFrom(event.target.value)} /></label>
              <label style={{display:'grid',gap:4,fontSize:11}}>Bitiş Tarihi<input type="date" value={orderReportTo} onChange={(event) => setOrderReportTo(event.target.value)} /></label>
              <button type="button" disabled={notesLoading} onClick={() => void exportCustomerOrders()}>Siparişleri Excel&apos;e Aktar</button>
            </div>
            {customerOrders.length ? <div style={{display:'grid',gap:8,marginBottom:16}}>{customerOrders.slice(0,5).map(order => <Link key={order.id} href={`/siparisler/${order.id}`} style={{display:'block',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:8,textDecoration:'none',color:'inherit'}}><b>{order.order_number}</b><small style={{display:'block'}}>{order.item_count} ürün · {money(order.total_amount,order.currency)} · {order.status} · {new Date(order.created_at).toLocaleDateString('tr-TR')}</small></Link>)}</div> : <p>Bu müşteriye bağlı sipariş bulunmuyor.</p>}
            <h3>Destek talepleri</h3>
            <p><Link href={`/destek?customer=${selected.id}`}>Bu müşteri için yeni destek talebi aç</Link></p>
            {supportTickets.length ? <div style={{display:'grid',gap:8,marginBottom:16}}>{supportTickets.slice(0,5).map(ticket => <Link key={ticket.id} href={`/destek?ticket=${ticket.id}`} style={{display:'block',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:8,textDecoration:'none',color:'inherit'}}><b>{ticket.ticket_number} · {ticket.subject}</b><small style={{display:'block'}}>{ticket.status} · {ticket.priority}{ticket.order_number ? ` · ${ticket.order_number}` : ''} · Yanıt hedefi: {new Date(ticket.due_at).toLocaleString('tr-TR')}</small></Link>)}</div> : <p>Bu müşteriye bağlı destek talebi bulunmuyor.</p>}
            <h3>Müşteri etiketleri</h3>
            <p>{selected.tags.length ? selected.tags.map(tag => <span key={tag.id} style={{display:'inline-block',margin:'0 6px 6px 0',padding:'3px 8px',borderRadius:99,color:'#fff',background:tag.color}}>{tag.name}</span>) : 'Henüz etiket yok.'}</p>
            {tags.length ? <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>{tags.map(tag => {
              const selectedTag = selected.tags.some(item => item.id === tag.id);
              return <button type="button" key={tag.id} disabled={saving || notesLoading} onClick={() => void toggleTag(tag)} style={{border:`1px solid ${tag.color}`,background:selectedTag ? tag.color : '#fff',color:selectedTag ? '#fff' : tag.color,borderRadius:99,padding:'5px 9px',cursor:'pointer'}}>{selectedTag ? '✓ ' : '+ '}{tag.name}</button>;
            })}</div> : <p>Önce yukarıdan bir etiket oluşturun.</p>}
            <h3>Trex sadakat puanı</h3>
            <p><strong>{loyalty?.pointsBalance ?? selected.loyalty_points ?? 0} puan</strong> · {loyalty?.tier ?? selected.loyalty_tier ?? 'BRONZE'}</p>
            <form onSubmit={adjustPoints}>
              <input required disabled={saving || notesLoading} value={points} onChange={(e) => setPoints(e.target.value)} inputMode="numeric" type="number" step="1" placeholder="+100 veya -100" />
              <textarea required maxLength={500} disabled={saving || notesLoading} value={pointsReason} onChange={(e) => setPointsReason(e.target.value)} placeholder="Puan işlem nedeni" />
              <button disabled={saving || notesLoading || !points || !pointsReason.trim()}>{saving ? 'Kaydediliyor…' : 'Puan hareketini kaydet'}</button>
            </form>
            {loyalty?.movements.length ? <>{loyalty.movements.slice(0,5).map((movement) => <article key={movement.id}><p><b>{movement.points_delta > 0 ? '+' : ''}{movement.points_delta} puan</b> · {movement.reason}</p><small>{new Date(movement.created_at).toLocaleString('tr-TR')}</small></article>)}</> : <p>Henüz puan hareketi yok.</p>}
            <h3>Müşteri talepleri</h3>
            <form onSubmit={createRequest}>
              <input required maxLength={180} disabled={saving || notesLoading} value={requestForm.subject} onChange={(e) => setRequestForm(current => ({...current,subject:e.target.value}))} placeholder="Talep başlığı" />
              <select value={requestForm.priority} disabled={saving || notesLoading} onChange={(e) => setRequestForm(current => ({...current,priority:e.target.value}))}><option value="LOW">Düşük öncelik</option><option value="NORMAL">Normal öncelik</option><option value="HIGH">Yüksek öncelik</option><option value="URGENT">Acil</option></select>
              <textarea required maxLength={5000} disabled={saving || notesLoading} value={requestForm.body} onChange={(e) => setRequestForm(current => ({...current,body:e.target.value}))} placeholder="Talep açıklaması" />
              <button disabled={saving || notesLoading || !requestForm.subject.trim() || !requestForm.body.trim()}>{saving ? 'Kaydediliyor…' : 'Talep aç'}</button>
            </form>
            {requests.length ? requests.map((item) => <article key={item.id}><p><b>{item.subject}</b> · {item.priority} · {item.status}</p><p>{item.body}</p>{item.status==='OPEN'&&<button disabled={saving} onClick={() => void updateRequest(item,'IN_PROGRESS')}>İşleme al</button>}{['OPEN','IN_PROGRESS'].includes(item.status)&&<button disabled={saving} onClick={() => void updateRequest(item,'RESOLVED')}>Çözüldü</button>}<small>{new Date(item.created_at).toLocaleString('tr-TR')}</small></article>) : <p>Henüz müşteri talebi yok.</p>}
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
