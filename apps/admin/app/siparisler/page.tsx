"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
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
};
const statusText: Record<string, string> = {
  PENDING_PAYMENT: "Ödeme bekliyor",
  PAID: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
};
const money = (value: string, currency: string) =>
  Number(value).toLocaleString("tr-TR", { style: "currency", currency });
const date = (value: string) =>
  new Date(value).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });

export default function Orders() {
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
  const [selected, setSelected] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
          text.includes(query.toLocaleLowerCase("tr-TR"))
        );
      }),
    [orders, query, statusFilter],
  );
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
  async function updateStatus(id: string, value: string) {
    try {
      await api(`/admin/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: value }),
      });
      setMessage("Sipariş durumu güncellendi.");
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Durum güncellenemedi");
    }
  }
  async function shipment(id: string) {
    try {
      const data = await api<{ trackingNumber?: string }>(
        `/admin/orders/${id}/shipment`,
        { method: "POST" },
      );
      setMessage(
        data.trackingNumber
          ? `Kargo kaydı oluşturuldu: ${data.trackingNumber}`
          : "Kargo kaydı oluşturuldu.",
      );
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kargo kaydı oluşturulamadı");
    }
  }
  return (
    <main>
      <AdminNav />
      <section className={styles.page}>
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
            <Link href="/finans/havaleler" className={styles.financeLink}>
              Havale onayları →
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
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("ALL");
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
                <th>Sipariş bilgileri</th>
                <th>Müşteri bilgileri</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>Kanal</th>
                <th>Tarih</th>
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
                    <b>
                      {order.marketplace_name ??
                        (order.sales_channel === "PUBLIC_WEB"
                          ? "Trex mağaza"
                          : (order.sales_channel ?? "—"))}
                    </b>
                    <small>{order.sales_channel ?? "SATIŞ KANALI"}</small>
                  </td>
                  <td>
                    <time>{date(order.created_at)}</time>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Link
                        href={`/siparisler/${order.id}`}
                        title="Sipariş detayı ve ödeme hareketleri"
                      >
                        Detay / Ödeme
                      </Link>
                      {canCreate &&
                        order.sales_channel === "ADMIN_ORDER" &&
                        order.status !== "CANCELLED" && (
                          <Link
                            className={styles.financeLink}
                            href={`/siparisler/${order.id}/duzenle`}
                          >
                            Düzenle
                          </Link>
                        )}
                      {canCreate &&
                        order.sales_channel === "ADMIN_ORDER" &&
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
                              : "İptal et"}
                          </button>
                        )}
                      {order.status === "PENDING_PAYMENT" && (
                        <Link
                          className={styles.approveLink}
                          href={`/finans/havaleler?order=${order.id}`}
                        >
                          Onaya gönder
                        </Link>
                      )}
                      {order.status === "PAID" && (
                        <button
                          type="button"
                          onClick={() =>
                            void updateStatus(order.id, "PROCESSING")
                          }
                        >
                          Hazırla
                        </button>
                      )}
                      {order.status === "PROCESSING" && (
                        <button
                          type="button"
                          onClick={() => void shipment(order.id)}
                        >
                          Kargola
                        </button>
                      )}
                      {order.status === "SHIPPED" && (
                        <button
                          type="button"
                          onClick={() =>
                            void updateStatus(order.id, "DELIVERED")
                          }
                        >
                          Teslim
                        </button>
                      )}
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
