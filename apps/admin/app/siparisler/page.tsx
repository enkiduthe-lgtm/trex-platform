"use client";

import Link from "next/link";
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
  sales_channel?: string;
  marketplace_name?: string | null;
  shipping_provider?: string | null;
  tracking_number?: string | null;
  shipment_status?: string | null;
};
const statusText: Record<string, string> = {
  PENDING_PAYMENT: "Ödeme bekliyor",
  PAID: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
};
const channelText: Record<string, string> = {
  RETAIL: "Perakende Satış", WHOLESALE: "Toptan Satış", PUBLIC_WEB: "Site Satış", INSTAGRAM: "Instagram Satış", DEALER_PORTAL: "Bayi Satış", MARKETPLACE: "Pazaryeri Satış", ADMIN_ORDER: "Yönetici siparişi",
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
  { value: "PROCESSING", label: "Hazırlananlar" },
  { value: "SHIPPED", label: "Kargolananlar" },
  { value: "DELIVERED", label: "Teslim edilenler" },
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
  const [canCreate, setCanCreate] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const actionLock = useRef(false);
  useEffect(() => {
    api<{ user: { role: string } }>("/auth/me")
      .then((data) =>
        setCanCreate(["ADMIN", "SUPER_ADMIN"].includes(data.user.role)),
      )
      .catch(() => setCanCreate(false));
  }, []);
  const [orders, setOrders] = useState<Order[]>([]);
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
      requestedStatus && requestedStatus in statusText
        ? requestedStatus
        : "ALL",
    );
    setSelected([]);
  }, [searchParams]);
  const load = () =>
    api<Order[]>("/admin/orders")
      .then(setOrders)
      .catch((e) =>
        setMessage(e instanceof Error ? e.message : "Siparişler yüklenemedi"),
      );
  useEffect(() => {
    void load();
  }, []);
  const visible = useMemo(
    () =>
      orders.filter((order) => {
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
          (statusFilter === "ALL" || order.status === statusFilter) &&
          (!dateFrom || order.created_at.slice(0, 10) >= dateFrom) &&
          (!dateTo || order.created_at.slice(0, 10) <= dateTo) &&
          text.includes(query.toLocaleLowerCase("tr-TR"))
        );
      }),
    [orders, query, statusFilter, dateFrom, dateTo],
  );
  const countFor = (status: string) =>
    status === "ALL" ? orders.length : orders.filter((order) => order.status === status).length;
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
  function exportOrders() {
    const source = selected.length
      ? visible.filter((order) => selected.includes(order.id))
      : visible;
    const total = source.reduce((sum, order) => sum + Number(order.total_amount), 0);
    const rows = [
      ["Satış Kanalı", "Sipariş No", "Müşteri", "Tutar", "Para Birimi", "Durum", "Kargo", "Tarih"],
      ...source.map((order) => [
        order.marketplace_name ?? (order.sales_channel ? channelText[order.sales_channel] ?? order.sales_channel : "—"),
        order.order_number,
        order.customer_name ?? order.customer_email ?? "Misafir müşteri",
        order.total_amount,
        order.currency,
        statusText[order.status] ?? order.status,
        order.shipping_provider ?? "",
        new Date(order.created_at).toLocaleString("tr-TR"),
      ]),
      ["", "", "", total.toFixed(2), "Toplam", "", "", ""],
    ];
    downloadXlsx("trex-siparisler.xlsx", "Siparişler", rows);
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
          <div className={styles.actions}>
            {canCreate && (
              <Link href="/siparisler/yeni" className={styles.financeLink}>
                + Yeni sipariş
              </Link>
            )}
            <Link href="/siparisler/havaleler" className={styles.financeLink}>
              Bekleyen Havaleler →
            </Link>
            <Link href="/siparisler/havaleler#giris" className={styles.financeLink}>
              Gelen Havale Girişi
            </Link>
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
            <button type="button" disabled={!visible.length} onClick={exportOrders}>
              Excel&apos;e Aktar{selected.length ? ` (${selected.length})` : ""}
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
                    <small>{Number(order.item_count)} ürün</small>
                  </td>
                  <td>
                    <b>{order.customer_name ?? "Misafir müşteri"}</b>
                    <small>{"Teslimat bilgileri detayda"}</small>
                  </td>
                  <td>
                    <b>{money(order.total_amount, order.currency)}</b>
                    <small>{order.currency}</small>
                  </td>
                  <td>
                    <span
                      className={`${styles.status} ${styles[`status_${order.status}`] ?? ""}`}
                    >
                      {statusText[order.status] ?? order.status}
                    </span>
                  </td>
                  <td>
                    <b>{order.shipping_provider ?? "Kargo bekliyor"}</b>
                    <small>{order.tracking_number ?? (order.status === "PROCESSING" ? "Paketleme sonrası oluşur" : order.marketplace_name ?? (order.sales_channel ? channelText[order.sales_channel] ?? order.sales_channel : "—"))}</small>
                  </td>
                  <td>
                    <time>{date(order.created_at)}</time>
                  </td>
                  <td>
                    <div className={styles.printActions}>
                      <Link className={`${styles.printLink} ${styles.iconLink}`} href={`/siparisler/${order.id}#fatura`} title="Fatura yazdır">
                        <OrderIcon name="print" /><span>Fatura</span>
                      </Link>
                      <Link className={`${styles.printLink} ${styles.iconLink}`} href={`/siparisler/${order.id}#barkod`} title="Sipariş barkodu yazdır">
                        <OrderIcon name="barcode" /><span>Barkod</span>
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
                      {canCreate &&
                        editableAdminChannels.includes(order.sales_channel ?? "") &&
                        order.status !== "CANCELLED" && (
                          <Link
                            className={styles.financeLink}
                            href={`/siparisler/${order.id}/duzenle`}
                          >
                            <OrderIcon name="edit" /><span>Düzenle</span>
                          </Link>
                        )}
                      {canCreate &&
                        editableAdminChannels.includes(order.sales_channel ?? "") &&
                        ["PENDING_PAYMENT", "PROCESSING"].includes(
                          order.status,
                        ) && (
                          <button
                            type="button"
                            disabled={pendingAction !== null}
                            onClick={() => void cancelOrder(order)}
                          >
                            {pendingAction === order.id
                              ? "İptal ediliyor…"
                              : <><OrderIcon name="trash" /><span>İptal</span></>}
                          </button>
                        )}
                      {order.status === "PENDING_PAYMENT" && (
                        <Link
                          className={styles.approveLink}
                          href={`/siparisler/havaleler?order=${encodeURIComponent(order.order_number)}`}
                        >
                          <OrderIcon name="check" /><span>Havale eşleştir</span>
                        </Link>
                      )}
                      {order.status === "PAID" && <Link style={stageActionStyle} className={styles.approveLink} href={`/siparisler/${order.id}`}><OrderIcon name="check" /><span>Hazırla</span></Link>}
                      {order.status === "PROCESSING" && (
                        <Link style={stageActionStyle} className={styles.approveLink} href={`/siparisler/${order.id}`}>
                          <OrderIcon name="check" /><span>Kargoya Ver</span>
                        </Link>
                      )}
                      {order.status === "SHIPPED" && (
                        <Link style={stageActionStyle} className={styles.approveLink} href={`/siparisler/${order.id}`}>
                          <OrderIcon name="check" /><span>Kargo Takip</span>
                        </Link>
                      )}
                      {order.status === "DELIVERED" && <Link style={stageActionStyle} className={styles.approveLink} href={`/siparisler/${order.id}`}><OrderIcon name="check" /><span>Teslim Edildi</span></Link>}
                      {order.status === "CANCELLED" && <Link style={stageActionStyle} className={styles.approveLink} href={`/siparisler/${order.id}`}><OrderIcon name="eye" /><span>İptal Detayı</span></Link>}
                    </div>
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
          {visible.length} sipariş gösteriliyor · Finans onayı gereken
          siparişler doğrudan ödeme onayı akışına yönlendirilir.
        </p>
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
