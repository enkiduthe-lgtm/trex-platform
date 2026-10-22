"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AdminNav } from "../../components/admin-nav";
import { api } from "../../lib/api";
import styles from "../orders.module.css";

const editableAdminChannels = ["ADMIN_ORDER", "RETAIL", "WHOLESALE", "PUBLIC_WEB", "INSTAGRAM", "MARKETPLACE"];

type Detail = {
  order_number: string;
  sales_channel: string;
  status: string;
  total_amount: string;
  currency: string;
  customer_email: string | null;
  contact_name: string | null;
  address: {
    recipient_name: string;
    phone: string;
    city: string;
    district: string;
    address_line: string;
    postal_code: string | null;
  } | null;
  items: {
    id: string;
    product_name: string;
    sku: string;
    quantity: number;
    unit_amount: string;
    currency: string;
  }[];
  payments: {
    id: string;
    provider: string;
    status: string;
    amount: string;
    currency: string;
    created_at: string;
    verified_at: string | null;
  }[];
  supportTickets: {
    id: string;
    ticket_number: string;
    subject: string;
    status: string;
    priority: string;
    created_at: string;
  }[];
  shipments: {
    id: string;
    status: string;
    tracking_number: string | null;
    provider: string;
    created_at: string;
    package_barcode: string | null;
    last_event_description: string | null;
    last_event_at: string | null;
  }[];
  fulfillment: {
    picking_status: string;
    picking_started_at: string;
    picking_completed_at: string | null;
    packed_at: string | null;
    package_barcode: string | null;
    shipment_status: string | null;
    tracking_number: string | null;
  } | null;
  returns: {
    id: string;
    status: string;
    reason: string;
    requested_at: string;
    completed_at: string | null;
  }[];
  activity: {
    action: string;
    created_at: string;
    actor_email: string | null;
  }[];
};
const paymentStatus: Record<string, string> = {
  SUCCEEDED: "Ödendi",
  PENDING: "Ödeme bekliyor",
  FAILED: "Başarısız",
  REFUNDED: "İade edildi",
};
const paymentMethod: Record<string, string> = {
  bank_transfer: "Havale / EFT",
  cash_on_delivery_card: "Kapıda ödeme — kart",
  cash_on_delivery_cash: "Kapıda ödeme — nakit",
  cash_on_delivery: "Kapıda ödeme",
  cash: "Elden nakit",
  paytr: "PayTR",
};
const orderStatus: Record<string, string> = {
  PAID: "Onaylandı",
  PENDING_PAYMENT: "Ödeme bekliyor",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
};
const money = (v: string, c: string) =>
  Number(v).toLocaleString("tr-TR", { style: "currency", currency: c });
type Invoice = {
  id: string;
  customer_type: "INDIVIDUAL" | "CORPORATE";
  provider_status: string;
  invoice_number: string | null;
  pdf_url: string | null;
};
export default function OrderDetail() {
  const [canEdit, setCanEdit] = useState(false);
  const [role, setRole] = useState("");
  useEffect(() => {
    api<{ user: { role: string } }>("/auth/me")
      .then((value) => {
        setRole(value.user.role);
        setCanEdit(["ADMIN", "SUPER_ADMIN"].includes(value.user.role));
      })
      .catch(() => { setRole(""); setCanEdit(false); });
  }, []);
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceType, setInvoiceType] = useState<"INDIVIDUAL" | "CORPORATE">("INDIVIDUAL");
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationMessage, setOperationMessage] = useState("");
  async function refreshOrder() {
    setData(await api<Detail>(`/admin/orders/${id}`));
  }
  async function startPreparation() {
    if (operationBusy) return;
    setOperationBusy(true);
    setError("");
    try {
      const pick = await api<{ id: string }>(
        `/admin/warehouse/picks/queue/${id}`,
        { method: "POST" },
      );
      window.location.assign(`/depo-operasyon?pick=${encodeURIComponent(pick.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hazırlama başlatılamadı");
      setOperationBusy(false);
    }
  }
  async function createShipment() {
    if (operationBusy) return;
    setOperationBusy(true);
    setError("");
    try {
      const shipment = await api<{ trackingNumber?: string }>(
        `/admin/orders/${id}/shipment`,
        { method: "POST" },
      );
      setOperationMessage(
        shipment.trackingNumber
          ? `Aras gönderisi oluşturuldu. Takip kodu: ${shipment.trackingNumber}`
          : "Kargo gönderisi oluşturuldu.",
      );
      await refreshOrder();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kargo gönderisi oluşturulamadı");
    } finally {
      setOperationBusy(false);
    }
  }
  async function moveShipment(
    shipmentStatus: "IN_TRANSIT" | "DELIVERED",
    orderStatus: "SHIPPED" | "DELIVERED",
  ) {
    if (operationBusy) return;
    setOperationBusy(true);
    setError("");
    try {
      await api(`/admin/orders/${id}/shipment/status`, {
        method: "POST",
        body: JSON.stringify({ status: shipmentStatus }),
      });
      await api(`/admin/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: orderStatus }),
      });
      setOperationMessage(
        orderStatus === "SHIPPED"
          ? "Gönderi kargoya verildi olarak işaretlendi."
          : "Gönderi teslim edildi olarak işaretlendi.",
      );
      await refreshOrder();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sevkiyat durumu güncellenemedi");
    } finally {
      setOperationBusy(false);
    }
  }
  async function cancelOrder() {
    if (
      cancelling ||
      !window.confirm(
        `Sipariş ${data?.order_number} iptal edilip ayrılan stok serbest bırakılsın mı?`,
      )
    )
      return;
    setCancelling(true);
    setError("");
    try {
      await api(`/admin/orders/${id}/cancel`, { method: "POST" });
      setData(await api<Detail>(`/admin/orders/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sipariş iptal edilemedi");
    } finally {
      setCancelling(false);
    }
  }
  async function saveInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invoiceSaving) return;
    const form = new FormData(event.currentTarget);
    setInvoiceSaving(true); setError("");
    try {
      const value = await api<Invoice>(`/admin/orders/${id}/invoice`, {
        method: "POST", body: JSON.stringify({
          customerType: invoiceType,
          recipientName: form.get("recipientName"),
          identityNumber: form.get("identityNumber") || undefined,
          companyName: form.get("companyName") || undefined,
          taxNumber: form.get("taxNumber") || undefined,
          taxOffice: form.get("taxOffice") || undefined,
          billingAddress: form.get("billingAddress"),
        }),
      });
      void value;
      setInvoice(await api<Invoice>(`/admin/orders/${id}/invoice`));
    } catch (e) { setError(e instanceof Error ? e.message : "Fatura taslağı kaydedilemedi"); }
    finally { setInvoiceSaving(false); }
  }
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api<Detail>(`/admin/orders/${id}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Sipariş yüklenemedi");
      });
    if (role === "SUPER_ADMIN") api<Invoice | null>(`/admin/orders/${id}/invoice`).then((value) => {
      if (active) setInvoice(value);
    }).catch(() => { if (active) setInvoice(null); });
    return () => {
      active = false;
    };
  }, [id, role]);
  return (
    <main>
      <AdminNav />
      <section className={styles.page}>
        <Link href="/siparisler">← Siparişler</Link>
        <h1>Sipariş detayı {data?.order_number}</h1>
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p>Yükleniyor…</p>}
        {data && (
          <>
            <p>
              Sipariş durumu: {orderStatus[data.status] ?? data.status} ·
              Toplam: {money(data.total_amount, data.currency)}
            </p>
            <section className={styles.notice}>
              <h2>Müşteri ve teslimat</h2>
              <p>
                {data.contact_name ??
                  data.address?.recipient_name ??
                  "Ad bilgisi yok"}{" "}
                · {data.customer_email ?? "E-posta bilgisi yok"}
              </p>
              {data.address ? (
                <>
                  <p>
                    Alıcı: {data.address.recipient_name} · Telefon:{" "}
                    {data.address.phone}
                  </p>
                  <p>
                    {data.address.address_line}, {data.address.district} /{" "}
                    {data.address.city} {data.address.postal_code}
                  </p>
                </>
              ) : (
                <p>Teslimat adresi bulunamadı. Siparişi göndermeyin.</p>
              )}
            </section>
            <p>
              Ödeme yöntemi:{" "}
              {data.payments
                .map(
                  (payment) =>
                    paymentMethod[payment.provider] ?? payment.provider,
                )
                .join(", ") || "Belirtilmedi"}
            </p>
            {canEdit &&
              editableAdminChannels.includes(data.sales_channel) &&
              data.status !== "CANCELLED" && (
                <Link
                  className={styles.financeLink}
                  href={`/siparisler/${id}/duzenle`}
                >
                  Siparişi düzenle
                </Link>
              )}
            {canEdit &&
              editableAdminChannels.includes(data.sales_channel) &&
              ["PENDING_PAYMENT", "PROCESSING"].includes(data.status) &&
              data.payments.length > 0 &&
              data.payments.every(
                (payment) => payment.status === "PENDING",
              ) && (
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => void cancelOrder()}
                >
                  {cancelling ? "İptal ediliyor…" : "Siparişi iptal et"}
                </button>
              )}
            {canEdit &&
              editableAdminChannels.includes(data.sales_channel) &&
              ["PENDING_PAYMENT", "PROCESSING"].includes(data.status) &&
              data.payments.length > 0 &&
              data.payments.every(
                (payment) =>
                  payment.status === "PENDING" &&
                  [
                    "bank_transfer",
                    "cash",
                    "cash_on_delivery_card",
                    "cash_on_delivery_cash",
                  ].includes(payment.provider),
              ) && (
                <Link
                  className={styles.financeLink}
                  href={`/siparisler/${id}/fiyatlar`}
                >
                  Sipariş fiyatlarını değiştir
                </Link>
              )}
            <h2>Ürünler</h2>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th>SKU</th>
                    <th>Adet</th>
                    <th>Birim fiyat (sipariş anı)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.product_name}</td>
                      <td>{item.sku}</td>
                      <td>{item.quantity}</td>
                      <td>{money(item.unit_amount, item.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h2>Ödeme hareketleri</h2>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Sağlayıcı</th>
                    <th>Durum</th>
                    <th>Tutar</th>
                    <th>Oluşturuldu</th>
                    <th>Doğrulandı</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.provider}</td>
                      <td>{paymentStatus[payment.status] ?? payment.status}</td>
                      <td>{money(payment.amount, payment.currency)}</td>
                      <td>
                        {new Date(payment.created_at).toLocaleString("tr-TR")}
                      </td>
                      <td>
                        {payment.verified_at
                          ? new Date(payment.verified_at).toLocaleString(
                              "tr-TR",
                            )
                          : "Henüz doğrulanmadı"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.payments.length === 0 && <p>Ödeme kaydı bulunamadı.</p>}
            </div>
            {role === "SUPER_ADMIN" && (
              <section className={styles.notice}>
                <h2>Paraşüt fatura hazırlığı</h2>
                {invoice ? (
                  <p>
                    {invoice.customer_type === "CORPORATE" ? "Kurumsal" : "Bireysel"} fatura taslağı kaydedildi. Durum: {invoice.provider_status}
                    {invoice.invoice_number ? ` · Fatura no: ${invoice.invoice_number}` : " · Paraşüt bağlantısı tamamlanınca gönderime hazır."}
                  </p>
                ) : (
                  <form onSubmit={saveInvoice}>
                    <label>Fatura türü
                      <select value={invoiceType} onChange={(event) => setInvoiceType(event.target.value as "INDIVIDUAL" | "CORPORATE")}>
                        <option value="INDIVIDUAL">Bireysel</option><option value="CORPORATE">Kurumsal</option>
                      </select>
                    </label>
                    {invoiceType === "INDIVIDUAL" ? <><label>Ad soyad<input name="recipientName" required defaultValue={data.contact_name ?? ""} /></label><label>TC kimlik no<input name="identityNumber" inputMode="numeric" pattern="[0-9]{11}" required /></label></> : <><label>Firma unvanı<input name="companyName" required /></label><label>Yetkili / alıcı<input name="recipientName" required defaultValue={data.contact_name ?? ""} /></label><label>Vergi no<input name="taxNumber" inputMode="numeric" pattern="[0-9]{10}" required /></label><label>Vergi dairesi<input name="taxOffice" /></label></>}
                    <label>Fatura adresi<input name="billingAddress" required defaultValue={data.address ? `${data.address.address_line}, ${data.address.district} / ${data.address.city}` : ""} /></label>
                    <button type="submit" disabled={invoiceSaving}>{invoiceSaving ? "Kaydediliyor…" : "Fatura taslağını kaydet"}</button>
                  </form>
                )}
              </section>
            )}
            <h2>Hazırlama ve sevkiyat akışı</h2>
            <section className={styles.notice}>
              {operationMessage && <p role="status">{operationMessage}</p>}
              <p><strong>1. Ürün hazırlanıyor:</strong> {data.fulfillment ? (data.fulfillment.picking_status === "COMPLETED" ? "Ürünler toplandı." : "Toplama işlemi devam ediyor.") : "Ödeme onayından sonra depo operasyonuna düşer."}</p>
              <p><strong>2. Paket / barkod:</strong> {data.fulfillment?.package_barcode ? `Paket barkodu basıldı: ${data.fulfillment.package_barcode}` : "Paketleme tamamlanınca barkod otomatik oluşur."}</p>
              <p><strong>3. Kargo:</strong> {data.fulfillment?.tracking_number ? `Takip kodu: ${data.fulfillment.tracking_number}` : "Kargo oluşturulduğunda takip kodu burada görünür."}</p>
              <div className={styles.actions}>
                {canEdit && data.status === "PAID" && (
                  <button type="button" disabled={operationBusy} onClick={() => void startPreparation()}>
                    {operationBusy ? "Hazırlama açılıyor…" : "Ürün hazırlamayı başlat"}
                  </button>
                )}
                {canEdit && data.status === "PROCESSING" && !data.fulfillment?.packed_at && (
                  <button type="button" disabled={operationBusy} onClick={() => void startPreparation()}>
                    {operationBusy ? "Açılıyor…" : "Ürünleri topla ve paketi kapat"}
                  </button>
                )}
                {canEdit && data.status === "PROCESSING" && data.fulfillment?.packed_at && !data.fulfillment.tracking_number && (
                  <button type="button" disabled={operationBusy} onClick={() => void createShipment()}>
                    {operationBusy ? "Aras kaydı açılıyor…" : "Aras barkodu ve takip kodunu oluştur"}
                  </button>
                )}
                {canEdit && data.status === "PROCESSING" && data.fulfillment?.shipment_status === "CREATED" && (
                  <button type="button" disabled={operationBusy} onClick={() => void moveShipment("IN_TRANSIT", "SHIPPED")}>
                    {operationBusy ? "Kaydediliyor…" : "Kargoya verildi olarak işaretle"}
                  </button>
                )}
                {canEdit && data.status === "SHIPPED" && data.fulfillment?.shipment_status === "IN_TRANSIT" && (
                  <button type="button" disabled={operationBusy} onClick={() => void moveShipment("DELIVERED", "DELIVERED")}>
                    {operationBusy ? "Kaydediliyor…" : "Teslim edildi olarak işaretle"}
                  </button>
                )}
              </div>
            </section>
            <h2>Kargo ve paket</h2>
            {data.shipments.length ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Firma</th>
                      <th>Durum</th>
                      <th>Takip no</th>
                      <th>Paket barkodu</th>
                      <th>Son hareket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shipments.map((shipment) => (
                      <tr key={shipment.id}>
                        <td>{shipment.provider}</td>
                        <td>{shipment.status}</td>
                        <td>{shipment.tracking_number ?? "Henüz yok"}</td>
                        <td>
                          {shipment.package_barcode ?? "Henüz paketlenmedi"}
                        </td>
                        <td>
                          {shipment.last_event_description ?? "Hareket yok"}
                          {shipment.last_event_at
                            ? ` · ${new Date(shipment.last_event_at).toLocaleString("tr-TR")}`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Bu sipariş için henüz kargo kaydı yok.</p>
            )}
            <h2>İade kayıtları</h2>
            {data.returns.length ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Durum</th>
                      <th>Neden</th>
                      <th>Talep tarihi</th>
                      <th>Tamamlandı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.returns.map((item) => (
                      <tr key={item.id}>
                        <td>{item.status}</td>
                        <td>{item.reason}</td>
                        <td>
                          {new Date(item.requested_at).toLocaleString("tr-TR")}
                        </td>
                        <td>
                          {item.completed_at
                            ? new Date(item.completed_at).toLocaleString(
                                "tr-TR",
                              )
                            : "Devam ediyor"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Bu sipariş için iade kaydı yok.</p>
            )}
            <h2>İşlem geçmişi</h2>
            {data.activity.length ? (
              data.activity.map((item, index) => (
                <p key={`${item.action}-${item.created_at}-${index}`}>
                  <strong>{item.action}</strong> ·{" "}
                  {item.actor_email ?? "Sistem"} ·{" "}
                  {new Date(item.created_at).toLocaleString("tr-TR")}
                </p>
              ))
            ) : (
              <p>Ek işlem kaydı yok.</p>
            )}
            <h2>Bağlı destek talepleri</h2>
            <Link className={styles.financeLink} href={`/destek?order=${id}`}>
              Bu sipariş için destek talebi aç
            </Link>
            {data.supportTickets.length ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Talep</th>
                      <th>Konu</th>
                      <th>Durum</th>
                      <th>Öncelik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.supportTickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>
                          <Link href={`/destek?ticket=${ticket.id}`}>
                            {ticket.ticket_number}
                          </Link>
                        </td>
                        <td>{ticket.subject}</td>
                        <td>{ticket.status}</td>
                        <td>{ticket.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Bu siparişe bağlı destek talebi yok.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
