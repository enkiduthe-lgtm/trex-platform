"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
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
const escapeLabelHtml = (value: string) =>
  value.replace(/[&<>\"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    };
    return replacements[character] ?? character;
  });
const code39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", A: "wnnnnwnnw", B: "nnwnnwnnw",
  C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww",
  O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw",
  W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
  "$": "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn",
};
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
  const autoPrinted = useRef(false);
  useEffect(() => {
    if (!data || autoPrinted.current || new URLSearchParams(window.location.search).get('print') !== 'barcode') return;
    autoPrinted.current = true;
    printPackageBarcode(data.fulfillment?.package_barcode || data.order_number);
  }, [data]);
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
  function printPackageBarcode(packageBarcode: string) {
    const value = packageBarcode.toUpperCase().replace(/[^0-9A-Z .\-$/+%]/g, "");
    const encoded = `*${value}*`;
    if (!value || [...encoded].some((character) => !code39[character])) {
      setError("Paket barkodu yazdırılamadı.");
      return;
    }
    let cursor = 20;
    const bars: string[] = [];
    for (const character of encoded) {
      [...code39[character]].forEach((width, index) => {
        const unit = width === "w" ? 5 : 2;
        if (index % 2 === 0) bars.push(`<rect x="${cursor}" y="12" width="${unit}" height="92" fill="#111" />`);
        cursor += unit;
      });
      cursor += 2;
    }
    const label = new URLSearchParams(window.location.search).get('print') === 'barcode' ? window : window.open("", "_blank", "popup=yes,width=720,height=440");
    if (!label) {
      setError("Yazdırma penceresi engellendi. Tarayıcıdan açılır pencereye izin verin.");
      return;
    }
    const orderNumber = escapeLabelHtml(data?.order_number ?? "");
    const recipient = escapeLabelHtml(data?.address?.recipient_name ?? data?.contact_name ?? "Alıcı bilgisi yok");
    const products = data?.items.length
      ? data.items.map((item) => `<li>${escapeLabelHtml(item.product_name)} <b>× ${item.quantity}</b></li>`).join("")
      : "<li>Ürün bilgisi bulunamadı</li>";
    label.document.write(`<!doctype html><html lang="tr"><head><title>Paket barkodu ${value}</title><style>@page{size:100mm 80mm;margin:4mm}body{font-family:Arial,sans-serif;margin:0;color:#111}.label{border:1px solid #111;padding:4mm;width:92mm;box-sizing:border-box}h1{font-size:15px;margin:0 0 2mm}.meta{display:flex;justify-content:space-between;gap:5mm;font-size:11px;margin:0 0 2mm}.products{border-top:1px solid #222;border-bottom:1px solid #222;margin:2mm 0;padding:2mm 0}.products strong{font-size:11px}.products ul{padding:0 0 0 4mm;margin:1mm 0;font-size:10px;columns:2}.products li{margin:0 0 1mm}.code{font-size:15px;letter-spacing:1px;font-weight:bold;text-align:center;margin-top:0}</style></head><body><section class="label"><h1>TREX TEA PAKET BARKODU</h1><div class="meta"><span>Sipariş: <b>${orderNumber}</b></span><span>Alıcı: <b>${recipient}</b></span></div><section class="products"><strong>Paket içeriği</strong><ul>${products}</ul></section><svg viewBox="0 0 ${cursor + 20} 116" width="100%" height="31mm" role="img" aria-label="${value}">${bars.join("")}</svg><div class="code">${value}</div></section><script>window.onload=()=>window.print()</script></body></html>`);
    label.document.close();
  }
  function printInvoice() {
    if (!data) return;
    const popup = window.open("", "_blank", "popup=yes,width=820,height=720");
    if (!popup) { setError("Yazdırma penceresi engellendi. Tarayıcıdan açılır pencereye izin verin."); return; }
    const recipient = escapeLabelHtml(data.address?.recipient_name ?? data.contact_name ?? "Alıcı bilgisi yok");
    const address = data.address ? escapeLabelHtml(`${data.address.address_line}, ${data.address.district} / ${data.address.city} ${data.address.postal_code ?? ""}`) : "Adres bilgisi yok";
    const items = data.items.map((item) => `<tr><td>${escapeLabelHtml(item.product_name)}</td><td>${escapeLabelHtml(item.sku)}</td><td>${item.quantity}</td><td>${escapeLabelHtml(item.unit_amount)} ${escapeLabelHtml(item.currency)}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html lang="tr"><head><title>Fatura ${escapeLabelHtml(data.order_number)}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#202020}header{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:12px}h1{margin:0;font-size:22px}.meta{margin:18px 0;display:grid;grid-template-columns:1fr 1fr;gap:16px}.box{border:1px solid #ccc;padding:10px}.box strong{display:block;margin-bottom:5px}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#f1f1f1}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:16px}</style></head><body><header><div><h1>TREX TEA</h1><p>Sipariş Faturası</p></div><div><strong>Sipariş No:</strong> ${escapeLabelHtml(data.order_number)}<br/><strong>Tarih:</strong> ${new Date().toLocaleDateString("tr-TR")}</div></header><section class="meta"><div class="box"><strong>Müşteri</strong>${recipient}<br/>${escapeLabelHtml(data.customer_email ?? "")}</div><div class="box"><strong>Teslimat Adresi</strong>${address}</div></section><table><thead><tr><th>Ürün</th><th>SKU</th><th>Adet</th><th>Birim Fiyat</th></tr></thead><tbody>${items}</tbody></table><p class="total">Toplam: ${escapeLabelHtml(data.total_amount)} ${escapeLabelHtml(data.currency)}</p><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
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
  async function issueInvoice() {
    if (invoiceSaving || !confirm("Faturayı Paraşüt’e göndermek istiyor musunuz?")) return;
    setInvoiceSaving(true); setError("");
    try { setInvoice(await api<Invoice>(`/admin/orders/${id}/invoice/issue`, { method: "POST" })); }
    catch (e) { setError(e instanceof Error ? e.message : "Fatura Paraşüt’e gönderilemedi"); }
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
            <div className={styles.detailLayout}>
            <section className={`${styles.detailCard} ${styles.summaryCard}`}>
              <div className={styles.cardHeader}>
                <h2>Sipariş özeti</h2>
                <span className={`${styles.status} ${styles[`status_${data.status}`] ?? ""}`}>{orderStatus[data.status] ?? data.status}</span>
              </div>
              <div className={styles.summaryValues}>
                <div><small>Toplam tutar</small><strong>{money(data.total_amount, data.currency)}</strong></div>
                <div><small>Ödeme yöntemi</small><strong>{data.payments.map((payment) => paymentMethod[payment.provider] ?? payment.provider).join(", ") || "Belirtilmedi"}</strong></div>
              </div>
              <div className={styles.cardActions}>
                {canEdit && editableAdminChannels.includes(data.sales_channel) && data.status !== "CANCELLED" && <Link className={styles.financeLink} href={`/siparisler/${id}/duzenle`}>Siparişi düzenle</Link>}
                {canEdit && editableAdminChannels.includes(data.sales_channel) && ["PENDING_PAYMENT", "PROCESSING"].includes(data.status) && data.payments.length > 0 && data.payments.every((payment) => payment.status === "PENDING") && <button type="button" disabled={cancelling} onClick={() => void cancelOrder()}>{cancelling ? "İptal ediliyor…" : "Siparişi iptal et"}</button>}
                {canEdit && editableAdminChannels.includes(data.sales_channel) && ["PENDING_PAYMENT", "PROCESSING"].includes(data.status) && data.payments.length > 0 && data.payments.every((payment) => payment.status === "PENDING" && ["bank_transfer", "cash", "cash_on_delivery_card", "cash_on_delivery_cash"].includes(payment.provider)) && <Link className={styles.financeLink} href={`/siparisler/${id}/fiyatlar`}>Sipariş fiyatlarını değiştir</Link>}
              </div>
            </section>
            <section className={styles.detailCard}>
              <div className={styles.cardHeader}><h2>Müşteri ve teslimat</h2><span>Müşteri bilgileri</span></div>
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
            <section className={`${styles.detailCard} ${styles.detailWide}`}>
            <div className={styles.cardHeader}><h2>Ürünler</h2><span>{data.items.length} ürün</span></div>
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
            </section>
            <section className={`${styles.detailCard} ${styles.detailWide}`}>
            <div className={styles.cardHeader}><h2>Ödeme hareketleri</h2><span>{data.payments.length} kayıt</span></div>
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
            </div>
            {data.payments.length === 0 && <p className={styles.emptyNote}>Ödeme kaydı bulunamadı.</p>}
            </section>
            {role === "SUPER_ADMIN" && (
              <section id="fatura" className={`${styles.detailCard} ${styles.detailWide}`}>
                <div className={styles.cardHeader}><h2>Paraşüt fatura hazırlığı</h2><span>Faturalama</span></div>
                {invoice ? (
                  <><p>
                    {invoice.customer_type === "CORPORATE" ? "Kurumsal" : "Bireysel"} fatura taslağı kaydedildi. Durum: {invoice.provider_status}
                    {invoice.invoice_number ? ` · Fatura no: ${invoice.invoice_number}` : " · Paraşüt gönderimine hazır."}
                  </p>{invoice.provider_status !== "ISSUED" && <button type="button" onClick={issueInvoice} disabled={invoiceSaving}>{invoiceSaving ? "Gönderiliyor…" : "Paraşüt’e gönder"}</button>}</>
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
                <div className={styles.cardActions}><button type="button" onClick={printInvoice}>Faturayı Yazdır</button></div>
              </section>
            )}
            <section className={`${styles.detailCard} ${styles.detailWide}`}>
              <div className={styles.cardHeader}><h2>Sipariş akışı</h2><span>Operasyon adımları</span></div>
              {operationMessage && <p role="status">{operationMessage}</p>}
              <ol className={styles.flowGrid}>
                <li className={data.fulfillment ? styles.flowDone : styles.flowCard}>
                  <span className={styles.flowNumber}>1</span>
                  <strong>Hazırla</strong>
                  <p>{data.fulfillment ? (data.fulfillment.picking_status === "COMPLETED" ? "Ürünler hazırlandı." : "Hazırlama devam ediyor.") : "Siparişi depo hazırlamasına gönderin."}</p>
                  {canEdit && data.status === "PAID" && <button type="button" disabled={operationBusy} onClick={() => void startPreparation()}>{operationBusy ? "Hazırlama açılıyor…" : "Hazırlamayı başlat"}</button>}
                </li>
                <li id="barkod" className={data.fulfillment?.packed_at ? styles.flowDone : styles.flowCard}>
                  <span className={styles.flowNumber}>2</span>
                  <strong>Paketle / barkod bas</strong>
                  <p>{data.fulfillment?.package_barcode ? `Paket barkodu: ${data.fulfillment.package_barcode}` : "Paket kapanınca barkod oluşur."}</p>
                  {canEdit && data.status === "PROCESSING" && !data.fulfillment?.packed_at && <button type="button" disabled={operationBusy} onClick={() => void startPreparation()}>{operationBusy ? "Paket hazırlanıyor…" : "Paketle ve barkod oluştur"}</button>}
                  {data.fulfillment?.package_barcode && <button type="button" className={styles.secondaryAction} onClick={() => printPackageBarcode(data.fulfillment!.package_barcode!)}>Barkodu yazdır</button>}
                </li>
                <li className={data.status === "SHIPPED" || data.status === "DELIVERED" ? styles.flowDone : styles.flowCard}>
                  <span className={styles.flowNumber}>3</span>
                  <strong>Kargoya ver</strong>
                  <p>{data.fulfillment?.tracking_number ? `Takip kodu: ${data.fulfillment.tracking_number}` : "Aras kaydını açıp paketi şubeye teslim edin."}</p>
                  {canEdit && data.status === "PROCESSING" && data.fulfillment?.packed_at && !data.fulfillment.tracking_number && <button type="button" disabled={operationBusy} onClick={() => void createShipment()}>{operationBusy ? "Kargo kaydı açılıyor…" : "Kargo kaydını hazırla"}</button>}
                  {canEdit && data.status === "PROCESSING" && data.fulfillment?.shipment_status === "CREATED" && <button type="button" disabled={operationBusy} onClick={() => void moveShipment("IN_TRANSIT", "SHIPPED")}>{operationBusy ? "Kaydediliyor…" : "Kargoya verildi olarak işaretle"}</button>}
                  {canEdit && data.status === "SHIPPED" && data.fulfillment?.shipment_status === "IN_TRANSIT" && <button type="button" disabled={operationBusy} onClick={() => void moveShipment("DELIVERED", "DELIVERED")}>{operationBusy ? "Kaydediliyor…" : "Teslim edildi olarak işaretle"}</button>}
                </li>
              </ol>
            </section>
            <section className={`${styles.detailCard} ${styles.detailWide}`}>
            <div className={styles.cardHeader}><h2>Kargo ve paket</h2><span>{data.shipments.length} gönderi</span></div>
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
              <p className={styles.emptyNote}>Bu sipariş için henüz kargo kaydı yok.</p>
            )}
            </section>
            <section className={styles.detailCard}>
            <div className={styles.cardHeader}><h2>İade kayıtları</h2><span>{data.returns.length} kayıt</span></div>
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
              <p className={styles.emptyNote}>Bu sipariş için iade kaydı yok.</p>
            )}
            </section>
            <section className={styles.detailCard}>
            <div className={styles.cardHeader}><h2>İşlem geçmişi</h2><span>{data.activity.length} hareket</span></div>
            {data.activity.length ? (
              <div className={styles.activityList}>{data.activity.map((item, index) => (
                <p className={styles.activityItem} key={`${item.action}-${item.created_at}-${index}`}>
                  <strong>{item.action}</strong> ·{" "}
                  {item.actor_email ?? "Sistem"} ·{" "}
                  {new Date(item.created_at).toLocaleString("tr-TR")}
                </p>
              ))}</div>
            ) : (
              <p className={styles.emptyNote}>Ek işlem kaydı yok.</p>
            )}
            </section>
            <section className={`${styles.detailCard} ${styles.detailWide}`}>
            <div className={styles.cardHeader}><h2>Bağlı destek talepleri</h2><span>{data.supportTickets.length} talep</span></div>
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
              <p className={styles.emptyNote}>Bu siparişe bağlı destek talebi yok.</p>
            )}
            </section>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
