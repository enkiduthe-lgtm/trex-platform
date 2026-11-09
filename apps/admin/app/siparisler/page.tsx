"use client";

import Link from "next/link";
import removal from '../components/removal.module.css';
import {
  useEffect,
  useMemo,
  useRef,
    useState,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
import { orderPermissions } from '../lib/order-permissions';
import { orderQueueStatus, nextPreparationAction, needsTransferMatching } from "../lib/order-queue";
import { paymentLabel } from "../lib/payment-label";
import { currencyTotals } from "../lib/report-totals";
import { financeDate } from "../lib/finance-report";
import { downloadXlsx } from "../lib/xlsx";
import styles from "./orders.module.css";

type Order = {
  id: string;
  order_number: string;
  status: string;
  total_amount: string;
  currency: string;
  created_at: string;
  customer_email: string | null;
  customer_name: string | null;
  item_count: string;
  products?: { product_name: string; sku: string; quantity: number }[];
  payment_method?: string | null;
  sales_channel?: string;
  marketplace_name?: string | null;
  shipping_provider?: string | null;
  tracking_number?: string | null;
  shipment_status?: string | null;
  preparation_status?: string | null; packed_at?: string | null;
};
type ExportLine = { id: string; order_number: string; product_name: string; sku: string; quantity: number; unit_amount: string; line_total: string; total_amount: string; cod_service_fee: string; currency: string; payment_method: string; sales_channel: string; marketplace_name: string | null; customer_name: string; status: string; shipment_status: string | null; shipping_provider: string | null; created_at: string };
type OrderNote = { id: string; admin_note: string | null };
// Carrier registration does not imply physical dispatch.
const queueStatus = orderQueueStatus;
const displayStatus = (order: {status:string;shipment_status?:string|null}) => order.status === 'PROCESSING' && order.shipment_status === 'CREATED' ? 'Kargo Kaydı Hazır' : statusText[queueStatus(order)] ?? order.status;
const statusText: Record<string, string> = {
  PENDING_PAYMENT: "Ödeme bekliyor",
  PAID: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
  REFUNDED: "İade Edildi",
};
const channelText: Record<string, string> = {
  RETAIL: "Perakende", WHOLESALE: "Toptan", PUBLIC_WEB: "Site", INSTAGRAM: "Instagram", DEALER_PORTAL: "Sistem Bayi", MARKETPLACE: "Pazaryeri", ADMIN_ORDER: "Yönetici Siparişi",
};
const editableAdminChannels = ["ADMIN_ORDER", "RETAIL", "WHOLESALE", "PUBLIC_WEB", "INSTAGRAM", "MARKETPLACE"];
const money = (value: string, currency: string) =>
  Number(value).toLocaleString("tr-TR", { style: "currency", currency });
const date = (value: string) =>
  new Date(value).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
const tabs = [
  { value: "PENDING_PAYMENT", label: "Onay bekleyenler" },
  { value: "PAID", label: "Onaylananlar" },
  { value: "PROCESSING", label: "Hazırlananlar" },
  { value: "REGISTERED", label: "Kargo Kaydı Hazır" },
  { value: "SHIPPED", label: "Kargolananlar" },
  { value: "DELIVERED", label: "Teslim edilenler" },
  { value: "REFUNDED", label: "İade Edilenler" },
  { value: "CANCELLED", label: "İptal edilenler" },
  { value: "ALL", label: "Tüm siparişler" },
];
const stageActionStyle = {
  background: "#f5c64c",
  color: "#3d3211",
  border: "1px solid #dcae37",
  fontWeight: 800,
};
function OrderIcon({ name }: { name: "eye" | "edit" | "print" | "barcode" | "trash" | "check" }) {
  const icon = {
    eye: <><path d="M2.5 12s3.3-5 9.5-5 9.5 5 9.5 5-3.3 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.2"/></>,
    edit: <><path d="m4 20 4.2-1 10-10-3.2-3.2-10 10L4 20Z"/><path d="m13.5 6.5 3.2 3.2"/></>,
    print: <><path d="M6 8V3h12v5M6 17H4V9h16v8h-2"/><path d="M7 14h10v7H7z"/></>,
    barcode: <><path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
  }[name];
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>;
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const [isDirector,setIsDirector]=useState(false);
  const [permissions, setPermissions] = useState(() => orderPermissions(''));
  const {
    create: canCreate, edit: canEdit, prepare: canPrepare, ship: canShip,
    verify: canVerify, transfers: canViewTransfers, createTransfer: canCreateTransfer,
  } = permissions;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const actionLock = useRef(false);
  useEffect(() => {
    let active = true;
    void api<{ user: { role: string } }>('/auth/me').then(async data => {
      const role = data.user.role;
      const profile = role === 'ADMIN'
        ? await api<{ configured: boolean; grants: string[] | null }>('/admin/access/me')
        : undefined;
      if (active) {
        setIsDirector(role === 'SUPER_ADMIN');
        setPermissions(orderPermissions(role, profile));
      }
    }).catch(() => {
      if (active) {
        setPermissions(orderPermissions(''));
        setMessage('İşlem Yetkileri Yüklenemedi. Sayfayı Yenileyin.');
      }
    });
    return () => { active = false; };
  }, []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [hasOlder,setHasOlder]=useState(false);
  const [loadingOlder,setLoadingOlder]=useState(false);
  const olderLock=useRef(false);
  const listGeneration=useRef(0);
  const [orderNotes, setOrderNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set());
  const noteLocks = useRef(new Set<string>());
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const requestedStatus = searchParams.get("durum");
    setStatusFilter(
      requestedStatus && tabs.some(tab => tab.value === requestedStatus)
        ? requestedStatus
        : "ALL",
    );
    setSelected([]);
  }, [searchParams]);
  const load = () => {
    listGeneration.current += 1;
    return Promise.all([api<Order[]>("/admin/orders"), api<OrderNote[]>("/admin/orders/notes")])
      .then(([loadedOrders, loadedNotes]) => {
        setOrders(loadedOrders);
        setHasOlder(loadedOrders.length === 100);
        setOrderNotes(Object.fromEntries(loadedNotes.map((item) => [item.id, item.admin_note ?? ""])));
      })
      .catch((e) =>
        setMessage(e instanceof Error ? e.message : "Siparişler yüklenemedi"),
      );
  };
  useEffect(() => {
    void load();
  }, []);
  async function loadOlder() {
    if(olderLock.current || !orders.length)return;
    olderLock.current=true;setLoadingOlder(true);
    const generation=listGeneration.current;
    try {
      const rows=await api<Order[]>(`/admin/orders?before=${encodeURIComponent(orders[orders.length-1].id)}`);
      if(generation !== listGeneration.current)return;
      setOrders(current=>{const ids=new Set(current.map(order=>order.id));return [...current,...rows.filter(order=>!ids.has(order.id))];});
      setHasOlder(rows.length===100);
    }catch(e){setMessage(e instanceof Error?e.message:'Eski Siparişler Yüklenemedi');}
    finally{olderLock.current=false;setLoadingOlder(false);}
  }
  const filterOrders = useMemo(() => (order: Order) => {
        const text = [
          order.order_number,
          order.customer_name,
          order.customer_email,
          order.sales_channel,
          order.marketplace_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        return (
          (statusFilter === "ALL" || queueStatus(order) === statusFilter) &&
          (!dateFrom || financeDate(order.created_at) >= dateFrom) &&
          (!dateTo || financeDate(order.created_at) <= dateTo) &&
          text.includes(query.toLocaleLowerCase("tr-TR"))
        );
  }, [query, statusFilter, dateFrom, dateTo]);
  const visible = useMemo(() => orders.filter(filterOrders), [orders, filterOrders]);
  const countFor = (status: string) =>
    status === "ALL" ? orders.length : orders.filter((order) => queueStatus(order) === status).length;
  const toggle = (id: string) =>
    setSelected((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  async function cancelOrder(order: Order) {
    if (
      actionLock.current ||
      !window.confirm(
        `${order.order_number} numaralı siparişi iptal edip ayrılan stoğu serbest bırakmak istiyor musun? Tahsil edilmiş veya paketlenmiş siparişler iptal edilmez.`,
      )
    )
      return;
    actionLock.current = true;
    setPendingAction(order.id);
    setMessage("");
    try {
      await api(`/admin/orders/${order.id}/cancel`, { method: "POST" });
      setMessage(
        `${order.order_number} iptal edildi; ayrılan stok serbest bırakıldı.`,
      );
      setSelected((current) => current.filter((id) => id !== order.id));
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Sipariş iptal edilemedi",
      );
    } finally {
      actionLock.current = false;
      setPendingAction(null);
    }
  }
  async function prepareOrder(order: Order, stage: 'prepare' | 'pack' | 'ship' | 'verify' = 'prepare') {
    if (actionLock.current) return;
    actionLock.current = true;
    setPendingAction(order.id);
    setMessage('');
    try {
      if(stage==='verify') {
        const result=await api<{found:boolean;integrationCode:string;packageBarcode:string;checkedAt:string}>(`/admin/orders/${order.id}/shipment/verify`,{method:'POST'});
        setMessage(`${order.order_number}: ${result.found?'Aras Servisinde Kayıt Ve Paket Barkodu Eşleşti. Portal Görünürlüğü Ve Şube Kabulü Ayrıca Doğrulanmalı.':'Aras Servisinde Kayıt Bulunamadı.'} Entegrasyon Kodu: ${result.integrationCode} · Paket Barkodu: ${result.packageBarcode} · Kontrol: ${new Date(result.checkedAt).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}. Yeni Gönderim Yapılmadı.`);
        return;
      }
      if (stage === 'pack') {
        const detail = await api<{ fulfillment: { picking_id: string; picking_status: string } | null }>(`/admin/orders/${order.id}`);
        if (!detail.fulfillment || detail.fulfillment.picking_status !== 'COMPLETED') throw new Error('Önce Sipariş Ürünlerini Hazırlayın.');
        await api(`/admin/warehouse/picks/${detail.fulfillment.picking_id}/pack`, { method: 'POST' });
      } else if (stage === 'ship') {
        await api(`/admin/orders/${order.id}/shipment`, { method: 'POST' });
      } else {
        await api(`/admin/warehouse/orders/${order.id}/prepare`, { method: 'POST' });
      }
      await load();
      setMessage(`${order.order_number}: ${stage === 'pack' ? 'Paket Hazırlandı Ve Barkod Oluşturuldu.' : stage === 'ship' ? 'Kargo Kaydı Oluşturuldu.' : 'Ürünler Hazırlandı. Paketleme İşlemine Geçebilirsiniz.'}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sipariş Hazırlanamadı');
    } finally { actionLock.current = false; setPendingAction(null); }
  }
  async function saveOrderNote(order: Order) {
    if (!canEdit || noteLocks.current.has(order.id)) return;
    noteLocks.current.add(order.id);
    setSavingNotes(current => new Set(current).add(order.id));
    try {
      const result = await api<OrderNote>(`/admin/orders/${order.id}/note`, {
        method: "PATCH",
        body: JSON.stringify({ note: orderNotes[order.id] ?? "" }),
      });
      setOrderNotes((current) => ({ ...current, [order.id]: result.admin_note ?? "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sipariş açıklaması kaydedilemedi");
    } finally {
      noteLocks.current.delete(order.id);
      setSavingNotes(current => { const next = new Set(current); next.delete(order.id); return next; });
    }
  }
  const [exporting, setExporting] = useState(false);
  async function exportOrders() {
    if (exporting) return;
    setExporting(true);
    try {
      const source = selected.length ? visible.filter(order => selected.includes(order.id)) : [...visible];
      if (!selected.length && hasOlder) {
        const seen = new Set(orders.map(order => order.id));
        let cursor = orders[orders.length - 1]?.id;
        while (cursor) {
          const page = await api<Order[]>('/admin/orders?before=' + encodeURIComponent(cursor));
          const fresh = page.filter(order => !seen.has(order.id));
          if (page.length && !fresh.length) throw new Error('Sipariş Geçmişi Okunamadı. Listeyi Yenileyip Tekrar Deneyin.');
          for (const order of fresh) {
            seen.add(order.id);
            if (filterOrders(order)) source.push(order);
          }
          if (page.length < 100) break;
          cursor = page[page.length - 1].id;
        }
      }
      if (!source.length) { setMessage('Seçilen Filtrelerde Sipariş Bulunamadı.'); return; }
      const lines: ExportLine[] = [];
      for (let offset = 0; offset < source.length; offset += 100) {
        const ids = source.slice(offset, offset + 100).map(order => order.id);
        lines.push(...await api<ExportLine[]>('/admin/orders/export-lines?orders=' + encodeURIComponent(ids.join(','))));
      }
      const covered = new Set(lines.map(line => line.id));
      if (source.some(order => !covered.has(order.id))) throw new Error('Bazı Siparişlerin Ürün Satırları Alınamadı. Listeyi Yenileyip Tekrar Deneyin.');
      const exportedOrders = [...new Map(lines.map(line => [line.id, line])).values()];
      const firstRows = new Set<string>();
      const rows = [
        ['Satış Kanalı', 'Sipariş No', 'Müşteri', 'Ürün', 'SKU', 'Adet', 'Gerçek Birim Fiyat', 'Ürün Satır Tutarı', 'Hizmet Bedeli', 'Sipariş Toplamı', 'Para Birimi', 'Ödeme Yöntemi', 'Durum', 'Kargo', 'Tarih'],
        ...lines.map(line => {
          const first = !firstRows.has(line.id);
          firstRows.add(line.id);
          return [line.marketplace_name || channelText[line.sales_channel] || line.sales_channel,
            line.order_number, line.customer_name, line.product_name, line.sku, line.quantity,
            Number(line.unit_amount), Number(line.line_total), first ? Number(line.cod_service_fee ?? '0') : '',
            first ? Number(line.total_amount) : '', line.currency, paymentLabel(line.payment_method),
            displayStatus(line), line.shipping_provider ?? '', new Date(line.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })];
        }),
        ...(['ACTIVE', 'CANCELLED', 'REFUNDED'] as const).flatMap(status => {
          const orders = exportedOrders.filter(order => status === 'ACTIVE' ? !['CANCELLED', 'REFUNDED'].includes(order.status) : order.status === status);
          const label = status === 'ACTIVE' ? 'İptal Ve İadeler Hariç Sipariş Toplamı' : status === 'CANCELLED' ? 'İptal Edilen Sipariş Toplamı' : 'İade Edilen Sipariş Toplamı';
          return currencyTotals(orders.map(order => ({currency:order.currency,amount:order.total_amount}))).map(total =>
            [label, '', '', '', '', '', '', '', '', Number(total.amount), total.currency, '', '', '', '']);
        }),
      ];
    downloadXlsx("trex-siparisler.xlsx", "Siparişler", rows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sipariş Raporu Hazırlanamadı.");
    } finally { setExporting(false); }
  }
  return (
    <main>
      <AdminNav />
      <section className={styles.page}>

        <nav className={styles.orderTabs} aria-label="Sipariş durumları">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.value}
              className={statusFilter === tab.value ? styles.currentTab : ""}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
              {tab.value !== "ALL" && <small>{countFor(tab.value)}</small>}
            </button>
          ))}
        </nav>
        <div className={styles.titleRow}>
          <div>
            <p>SİPARİŞ OPERASYONU</p>
            <h1>Siparişler</h1>
          </div>
          <div className={styles.headerActions}>
            {isDirector&&<Link href="/siparisler/sil" className={removal.entry}><OrderIcon name="trash"/><span>Sipariş Sil / Silinenler</span></Link>}
            {canCreate && (
              <Link href="/siparisler/yeni" className={styles.financeLink}>
                + Yeni sipariş
              </Link>
            )}
            {canViewTransfers && <Link href="/siparisler/havaleler" className={styles.financeLink}>Bekleyen Havaleler →</Link>}
            {canCreateTransfer && <Link href="/siparisler/havaleler#giris" className={styles.financeLink}>Gelen Havale Girişi</Link>}
          </div>
        </div>
        {message && (
          <p className={styles.notice} role="status">
            {message}
          </p>
        )}
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.filterButton}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            ☷ Filtreler <span>{filtersOpen ? "⌃" : "⌄"}</span>
          </button>
          <label className={styles.search}>
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Sipariş no, ad soyad veya kanal ara"
            />
          </label>
          <div className={styles.bulk}>
            <button type="button" disabled={exporting || (!visible.length && !hasOlder)} onClick={exportOrders}>
              {exporting ? "Rapor Hazırlanıyor…" : "Excel’e Aktar"}{selected.length ? ` (${selected.length})` : ""}
            </button>
            {selected.length > 0 && (
              <>
                <strong>{selected.length} seçildi</strong>
                <button type="button" onClick={() => setSelected([])}>
                  Seçimi kaldır
                </button>
              </>
            )}
          </div>
        </div>
        {filtersOpen && (
          <div className={styles.filters}>
            <label>
              Durum
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="ALL">Tüm durumlar</option>
                {Object.entries(statusText).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Başlangıç Tarihi
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              Bitiş Tarihi
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("ALL");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Filtreleri sıfırla
            </button>
          </div>
        )}
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="Tüm siparişleri seç"
                    type="checkbox"
                    checked={
                      visible.length > 0 &&
                      visible.every((order) => selected.includes(order.id))
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? visible.map((order) => order.id)
                          : [],
                      )
                    }
                  />
                </th>
                <th>Satış Kanalı</th>
                <th>Sipariş bilgileri</th>
                <th>Müşteri bilgileri</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>Kargo</th>
                <th>Tarih</th>
                <th>Yazdır</th>
                <th>İşlemler</th>
                <th>Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <tr key={order.id}>
                  <td>
                    <input
                      aria-label={`${order.order_number} seç`}
                      type="checkbox"
                      checked={selected.includes(order.id)}
                      onChange={() => toggle(order.id)}
                    />
                  </td>
                  <td>
                    <b>{order.marketplace_name ?? (order.sales_channel ? channelText[order.sales_channel] ?? order.sales_channel : "—")}</b>
                    <small>{order.sales_channel ?? "Kanal belirtilmedi"}</small>
                  </td>
                  <td>
                    <Link href={`/siparisler/${order.id}`}>
                      <b>{order.order_number}</b>
                    </Link>
                    <small>Toplam {Number(order.item_count)} Adet</small>
                    {!!order.products?.length && <ul className={styles.productSummary} aria-label="Sipariş Ürünleri">
                      {order.products.map((product,index) => <li key={product.sku + ':' + index}>
                        <span>{product.product_name}</span><strong>{product.quantity} Adet</strong>
                      </li>)}
                    </ul>}
                  </td>
                  <td>
                    <Link href={`/siparisler/${order.id}#musteri`}><b>{order.customer_name ?? "Misafir Müşteri"}</b></Link>
                    <small>Müşteri Kartını Aç</small>
                  </td>
                  <td>
                    <b>{money(order.total_amount, order.currency)}</b>
                    <small>{order.currency}</small>
                    <small>{paymentLabel(order.payment_method)}</small>
                  </td>
                  <td>
                    <span
                      className={`${styles.status} ${styles[`status_${order.status}`] ?? ""}`}
                    >
                      {displayStatus(order)}
                    </span>
                  </td>
                  <td>
                    <b>{order.shipping_provider ?? "Kargo bekliyor"}</b>
                    <small>{order.tracking_number ?? (order.shipment_status === "CREATED" ? "Şube Kabulü / Takip Bekleniyor" : order.status === "PROCESSING" ? "Paketleme Sonrası Oluşur" : order.marketplace_name ?? (order.sales_channel ? channelText[order.sales_channel] ?? order.sales_channel : "—"))}</small>
                  </td>
                  <td>
                    <time>{date(order.created_at)}</time>
                  </td>
                  <td>
                    <div className={styles.printActions}>
                      <Link className={`${styles.printLink} ${styles.iconLink}`} href={`/siparisler/${order.id}/fatura`} target="_blank" rel="noopener noreferrer" title="Fatura Yazdır">
                        <OrderIcon name="print" /><span>Fatura</span>
                      </Link>
                      <Link className={`${styles.printLink} ${styles.iconLink}`} href={`/siparisler/${order.id}?print=barcode`} target="_blank" rel="noopener noreferrer" title="Sipariş Barkodu Yazdır">
                        <OrderIcon name="barcode" /><span>{order.shipping_provider==='aras'?'Aras MÖK.':'Paket Etiketi'}</span>
                      </Link>
                    </div>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Link
                        href={`/siparisler/${order.id}`}
                        title="Sipariş detayı ve ödeme hareketleri"
                      >
                        <OrderIcon name="eye" /><span>Detay</span>
                      </Link>
                      {canEdit &&
                        editableAdminChannels.includes(order.sales_channel ?? "") &&
                        order.status !== "CANCELLED" && (
                          <Link
                            className={styles.financeLink}
                            href={`/siparisler/${order.id}/duzenle`}
                          >
                            <OrderIcon name="edit" /><span>Düzenle</span>
                          </Link>
                        )}
                      {canEdit &&
                        editableAdminChannels.includes(order.sales_channel ?? "") &&
                        ["PENDING_PAYMENT", "PROCESSING"].includes(
                          order.status,
                        ) && (
                          <button
                            type="button"
                            className={styles.cancelAction}
                            disabled={pendingAction !== null}
                            onClick={() => void cancelOrder(order)}
                          >
                            {pendingAction === order.id
                              ? "İptal ediliyor…"
                              : <><OrderIcon name="trash" /><span>İptal</span></>}
                          </button>
                        )}
                      {isDirector&&(order.status==='CANCELLED'?<Link className={styles.deleteLink} href={`/siparisler/sil?siparis=${encodeURIComponent(order.id)}`}><OrderIcon name="trash"/><span>Sipariş Sil</span></Link>:<button type="button" className={styles.deleteLink} disabled title="Silmek İçin Önce Siparişi İptal Edin"><OrderIcon name="trash"/><span>Sipariş Sil</span></button>)}
                      {canViewTransfers && needsTransferMatching(order) && (
                        <Link
                          className={styles.approveLink}
                          href={`/siparisler/havaleler?order=${encodeURIComponent(order.order_number)}`}
                        >
                          <OrderIcon name="check" /><span>Havale eşleştir</span>
                        </Link>
                      )}
                      {canPrepare && ["prepare","pack"].includes(nextPreparationAction(order) ?? "") && <button type="button" style={stageActionStyle} className={styles.approveLink} disabled={pendingAction !== null} onClick={() => void prepareOrder(order, order.preparation_status === 'COMPLETED' ? 'pack' : 'prepare')}><OrderIcon name="check" /><span>{pendingAction === order.id ? 'İşleniyor…' : order.preparation_status === 'COMPLETED' ? 'Paketle / Barkod Oluştur' : 'Hazırla'}</span></button>}
                      {canShip && nextPreparationAction(order) === 'ship' && (
                        <button type="button" style={stageActionStyle} className={styles.approveLink} disabled={pendingAction !== null} onClick={() => void prepareOrder(order, 'ship')}>
                          <OrderIcon name="check" /><span>Kargo Kaydını Hazırla</span>
                        </button>
                      )}
                      {queueStatus(order) === "SHIPPED" && (
                        <Link style={stageActionStyle} className={styles.approveLink} href={`/siparisler/${order.id}`}>
                          <OrderIcon name="check" /><span>Kargo Takip</span>
                        </Link>
                      )}
                      {canVerify && order.shipping_provider === 'aras' && order.shipment_status && <button type="button" className={styles.approveLink} disabled={pendingAction !== null} onClick={() => void prepareOrder(order, 'verify')}>{pendingAction === order.id ? 'Aras Sorgulanıyor…' : 'Yalnız Aras Kaydını Sorgula'}</button>}
                      {queueStatus(order) === "DELIVERED" && <Link style={stageActionStyle} className={styles.approveLink} href={`/siparisler/${order.id}`}><OrderIcon name="check" /><span>Teslim Edildi</span></Link>}
                      {order.status === "REFUNDED" && <Link style={stageActionStyle} className={styles.approveLink} href={`/siparisler/${order.id}`}><OrderIcon name="eye" /><span>İade Detayı</span></Link>}
                      {order.status === "CANCELLED" && <Link style={stageActionStyle} className={styles.approveLink} href={`/siparisler/${order.id}`}><OrderIcon name="eye" /><span>İptal Detayı</span></Link>}
                    </div>
                  </td>
                  <td>
                    {canEdit ? <textarea
                      aria-label={`${order.order_number} açıklaması`}
                      value={orderNotes[order.id] ?? ""}
                      maxLength={1000}
                      placeholder="Açıklama ekle"
                      onChange={(event) => setOrderNotes((current) => ({ ...current, [order.id]: event.target.value }))}
                      onBlur={() => void saveOrderNote(order)}
                      disabled={savingNotes.has(order.id)}
                      style={{ minWidth: 160, minHeight: 42, resize: "vertical" }}
                    /> : <small>{orderNotes[order.id] || "—"}</small>}
                    {savingNotes.has(order.id) && <small>Kaydediliyor…</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <div className={styles.empty}>
              Bu filtrelerde sipariş bulunamadı.
            </div>
          )}
        </div>
        <p className={styles.count}>
          {visible.length} Sipariş Gösteriliyor · {orders.length} Kayıt Yüklendi. {hasOlder && "Filtreler Yüklenen Kayıtlarda Uygulanır; Daha Eski Kayıtları Aşağıdan Yükleyebilirsiniz."} Finans onayı gereken
          siparişler doğrudan ödeme onayı akışına yönlendirilir.
        </p>
        {hasOlder && <button type="button" className={styles.approveLink} disabled={loadingOlder || pendingAction !== null} onClick={()=>void loadOlder()}>{loadingOlder ? "Yükleniyor…" : "Daha Eski Siparişleri Yükle"}</button>}
      </section>
    </main>
  );
}


export default function Orders() {
  return (
    <Suspense fallback={<main><AdminNav /></main>}>
      <OrdersContent />
    </Suspense>
  );
}
