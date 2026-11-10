"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { DealerLevelBadge } from "../../components/dealer-level-badge";
import { AdminNav } from "../../components/admin-nav";
import { api } from "../../lib/api";
import { orderPermissions } from '../../lib/order-permissions';
import { nextPreparationAction, orderQueueStatus } from "../../lib/order-queue";
import styles from "../orders.module.css";

const preparationAction = (order:Detail) => nextPreparationAction({status:order.status,shipment_status:order.fulfillment?.shipment_status,preparation_status:order.fulfillment?.picking_status,packed_at:order.fulfillment?.packed_at});
const editableAdminChannels = ["ADMIN_ORDER", "RETAIL", "WHOLESALE", "PUBLIC_WEB", "INSTAGRAM", "MARKETPLACE"];

type Detail = {
  customer_id?: string | null;
  dealer_id?: string | null; dealer_name?: string | null; dealer_level_name?: string | null;
  order_number: string;
  sales_channel: string;
  status: string;
  total_amount: string; cod_service_fee?:string;
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
    picking_id: string;
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
  dealer_commission: "Bayi prim bakiyesi",
  paytr: "PayTR",
};
const orderStatus: Record<string, string> = {
  PAID: "Onaylandı",
  PENDING_PAYMENT: "Ödeme bekliyor",
  PROCESSING: "Hazırlanıyor",
  REGISTERED: "Kargo kaydı hazır",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
  REFUNDED: "İade edildi",
};
const returnStatus: Record<string,string> = {
  REQUESTED:'Talep alındı', APPROVED:'Onaylandı', RECEIVED:'Depoya ulaştı',
  INSPECTED:'İncelendi', REFUNDED:'Ücret iade edildi', REJECTED:'Reddedildi', CANCELLED:'İptal edildi',
};
const supportStatus: Record<string,string> = {
  OPEN:'Açık', IN_PROGRESS:'İşlemde', WAITING_CUSTOMER:'Müşteri bekleniyor', RESOLVED:'Çözüldü', CLOSED:'Kapandı',
};
const supportPriority: Record<string,string> = {LOW:'Düşük', NORMAL:'Normal', HIGH:'Yüksek', URGENT:'Acil'};
const activityLabel: Record<string,string> = {
  'order.admin.created':'Sipariş oluşturuldu', 'order.dealer.created':'Bayi siparişi oluşturuldu',
  'order.admin.updated':'Sipariş bilgileri düzenlendi', 'order.admin.prices.updated':'Sipariş fiyatları değiştirildi',
  'order.admin_note.updated':'Sipariş notu güncellendi', 'order.cancelled':'Sipariş iptal edildi',
  'warehouse.order.prepared':'Ürünler hazırlandı', 'warehouse.pick.started':'Hazırlama başlatıldı',
  'warehouse.pick.completed':'Hazırlama tamamlandı', 'warehouse.package.completed':'Paketleme tamamlandı',
  'warehouse.pick_item.updated':'Hazırlanan ürün güncellendi', 'warehouse.pick_item.scanned':'Ürün barkodu okutuldu',
  'invoice.parasut.draft_created':'Fatura taslağı oluşturuldu', 'invoice.parasut.issued':'Fatura düzenlendi',
  'order.list.deleted':'Sipariş silinenlere taşındı', 'order.list.restored':'Sipariş geri alındı',
  'return.requested':'İade talebi alındı', 'return.approved':'İade onaylandı', 'return.rejected':'İade reddedildi',
  'return.received':'İade depoya ulaştı', 'return.inspected':'İade incelendi', 'return.refunded':'İade ücreti ödendi',
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
  const [permissions, setPermissions] = useState(() => orderPermissions(''));
  const [permissionsReady, setPermissionsReady] = useState(false);
  const { edit: canEdit, prepare: canPrepare, ship: canShip, verify: canVerify,
    updateShipment: canUpdateShipment, viewCustomer: canViewCustomer, viewDealer: canViewDealer } = permissions;
  const [role, setRole] = useState('');
  const [automaticTracking, setAutomaticTracking] = useState<boolean | null>(null);
  useEffect(() => {
    if (!permissions.viewShipping) return;
    let active = true;
    void api<{ tracking?: { enabled: boolean; configured: boolean } }>('/admin/orders/shipping/status')
      .then(value => { if (active && value.tracking) setAutomaticTracking(Boolean(value.tracking.enabled && value.tracking.configured)); })
      .catch(() => { if (active) setAutomaticTracking(null); });
    return () => { active = false; };
  }, [permissions.viewShipping]);
  useEffect(() => {
    let active = true;
    void api<{ user: { role: string } }>('/auth/me').then(async value => {
      const currentRole = value.user.role;
      const profile = currentRole === 'ADMIN'
        ? await api<{ configured: boolean; grants: string[] | null }>('/admin/access/me')
        : undefined;
      if (active) {
        setRole(currentRole);
        setPermissions(orderPermissions(currentRole, profile));
        setPermissionsReady(true);
      }
    }).catch(() => {
      if (active) { setRole(''); setPermissions(orderPermissions('')); setPermissionsReady(true); }
    });
    return () => { active = false; };
  }, []);
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const displayStatus = data ? orderQueueStatus({status:data.status, shipment_status:data.fulfillment?.shipment_status}) : '';
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const autoPrinted = useRef(false);
  useEffect(() => {
    if (!data || !permissionsReady || autoPrinted.current || new URLSearchParams(window.location.search).get('print') !== 'barcode') return;
    autoPrinted.current = true;
    if(data.shipments.some(shipment=>shipment.provider==='aras')) {
      if (!canVerify) { setError('Aras Barkod Doğrulaması İçin Kargo Yetkisi Gerekli.'); return; }
      void api<{found:boolean;integrationCode:string}>(`/admin/orders/${id}/shipment/verify`,{method:'POST'}).then(result=>{
        if(!result.found){setError('Aras Kaydı Bulunamadı. MÖK Barkodu Yazdırılmadı.');return;}
        printPackageBarcode(result.integrationCode,true);
      }).catch(e=>setError(e instanceof Error?e.message:'Aras Kaydı Doğrulanamadı. Barkod Yazdırılmadı.'));
      return;
    }
    printPackageBarcode(data.fulfillment?.package_barcode || data.order_number);
  }, [data, permissionsReady, canVerify]);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceType, setInvoiceType] = useState<"INDIVIDUAL" | "CORPORATE">("INDIVIDUAL");
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationMessage, setOperationMessage] = useState("");
  const [arasCheck,setArasCheck]=useState<{orderNumber:string;integrationCode:string;packageBarcode:string;found:boolean;checkedAt:string}|null>(null);
  async function verifyArasOnly() {
    if(operationBusy)return;
    setOperationBusy(true);setError('');setArasCheck(null);
    try {setArasCheck(await api(`/admin/orders/${id}/shipment/verify`,{method:'POST'}));}
    catch(e){setError(e instanceof Error?e.message:'Aras Kaydı Kontrol Edilemedi');}
    finally{setOperationBusy(false);}
  }
  async function refreshOrder() {
    try {
      setData(await api<Detail>(`/admin/orders/${id}`));
    } catch {
      // The mutation has already returned successfully. Hide stale actions;
      // retrying this screen must only read the updated order, never resend it.
      setData(null);
      throw new Error('İşlem kaydedildi ancak güncel sipariş bilgileri yüklenemedi. Tekrar Dene düğmesi yalnız bilgileri yeniler; işlemi yeniden göndermez.');
    }
  }
  async function startPreparation() {
    if (operationBusy) return;
    setOperationBusy(true);
    setError("");
    try {
      if (data?.fulfillment?.picking_status === 'COMPLETED') {
        await api(`/admin/warehouse/picks/${data.fulfillment.picking_id}/pack`, { method: 'POST' });
        setOperationMessage('Paket Hazırlandı Ve Barkod Oluşturuldu.');
      } else {
        await api(`/admin/warehouse/orders/${id}/prepare`, { method: 'POST' });
        setOperationMessage('Sipariş Ürünleri Hazırlandı.');
      }
      await refreshOrder();
      setOperationBusy(false);
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
      setArasCheck(null);
      const shipment = await api<{ trackingNumber?: string; replayed?:boolean }>(
        `/admin/orders/${id}/shipment`,
        { method: "POST" },
      );
      setOperationMessage(
        shipment.trackingNumber
          ? `Kargo Kaydı Oluşturuldu. Takip Kodu: ${shipment.trackingNumber}`
          : shipment.replayed ? "Mevcut Aras Kaydı Doğrulandı. Yeni Gönderim Yapılmadı." : "Kargo Kaydı Oluşturuldu. Fiziksel Şube Kabulü Henüz Doğrulanmadı.",
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
  function printPackageBarcode(packageBarcode: string, arasMok = false) {
    const value = packageBarcode.toUpperCase();
    const encoded = `*${value}*`;
    if (!value || value.includes("*") || [...encoded].some((character) => !code39[character])) {
      setError("Barkod Desteklenmeyen Karakter İçeriyor. Barkod Kaydını Kontrol Edin.");
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
    const originalWrite = label.document.write.bind(label.document);
    // Long existing MÖK codes need a wider label to retain scannable bars.
    const writeLabel = (html:string) => originalWrite(arasMok ? html.replaceAll('Paket barkodu','Aras MÖK Barkodu').replace('TREX TEA PAKET BARKODU','ARAS MÖK BARKODU').replace('size:100mm 80mm','size:160mm 100mm').replace('width:92mm','width:152mm') : html);
    writeLabel(`<!doctype html><html lang="tr"><head><title>Paket barkodu ${value}</title><style>@page{size:100mm 80mm;margin:4mm}body{font-family:Arial,sans-serif;margin:0;color:#111}.label{border:1px solid #111;padding:4mm;width:92mm;box-sizing:border-box}h1{font-size:15px;margin:0 0 2mm}.meta{display:flex;justify-content:space-between;gap:5mm;font-size:11px;margin:0 0 2mm}.products{border-top:1px solid #222;border-bottom:1px solid #222;margin:2mm 0;padding:2mm 0}.products strong{font-size:11px}.products ul{padding:0 0 0 4mm;margin:1mm 0;font-size:10px;columns:2}.products li{margin:0 0 1mm}.print-actions{display:flex;justify-content:center;padding:16px}.print-actions button{padding:12px 24px;font-size:16px;cursor:pointer}@media print{.print-actions{display:none}}.code{font-size:15px;letter-spacing:1px;font-weight:bold;text-align:center;margin-top:0}</style></head><body><section class="label"><h1>TREX TEA PAKET BARKODU</h1><div class="meta"><span>Sipariş: <b>${orderNumber}</b></span><span>Alıcı: <b>${recipient}</b></span></div><section class="products"><strong>Paket içeriği</strong><ul>${products}</ul></section><svg preserveAspectRatio="none" viewBox="0 0 ${cursor + 20} 116" width="100%" height="31mm" role="img" aria-label="${value}">${bars.join("")}</svg><div class="code">${value}</div></section><div class="print-actions"><button type="button" onclick="window.print()">Barkodu Yazdır</button></div><script>window.onload=()=>window.print()</script></body></html>`);
    label.document.close();
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
      await refreshOrder();
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
    setLoading(true);
    setInvoice(null);
    setArasCheck(null);
    setOperationMessage('');
    setError("");
    api<Detail>(`/admin/orders/${id}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Sipariş yüklenemedi");
      }).finally(() => { if (active) setLoading(false); });
    if (role === "SUPER_ADMIN") api<Invoice | null>(`/admin/orders/${id}/invoice`).then((value) => {
      if (active) setInvoice(value);
    }).catch(() => { if (active) setInvoice(null); });
    return () => {
      active = false;
    };
  }, [id, role, loadAttempt]);
  return (
    <main>
      <AdminNav />
      <section className={styles.page}>
        <Link href="/siparisler">← Siparişler</Link>
        <h1>Sipariş detayı {data?.order_number}</h1>
        {error && data && <p className={styles.notice} role="alert">{error}</p>}
        {!data && <section className={styles.detailCard} aria-busy={loading}>
          <h2>{loading ? "Sipariş Yükleniyor" : "Sipariş Açılamadı"}</h2>
          {loading ? <p role="status">Sipariş, müşteri ve paket bilgileri getiriliyor…</p> : <>
            <p className={styles.notice} role="alert">{error || "Sipariş bilgilerine ulaşılamadı."}</p>
            <p>Bilgileri yeniden yükleyebilir veya sipariş listesine dönebilirsiniz.</p>
            <div className={styles.cardActions}>
              <button type="button" onClick={() => { setLoading(true); setError(''); setLoadAttempt(value => value + 1); }}>Tekrar Dene</button>
              <Link className={styles.secondaryAction} href="/siparisler">Sipariş Listesine Dön</Link>
            </div>
          </>}
        </section>}
        {data && (
          <>
            <div className={styles.detailLayout}>
            <section className={`${styles.detailCard} ${styles.detailWide}`}>
              <div className={styles.cardHeader}><h2>Sipariş Akışı</h2><span>Hazırla → Paketle → Aras Kaydı Ve MÖK. → Kargo Takibi</span></div>
              {data.status==='PENDING_PAYMENT'&&<p className={styles.notice}>Önce Ödeme Kontrolünü Tamamlayın. <Link href={`/siparisler/havaleler?order=${encodeURIComponent(data.order_number)}`}>Havale Eşleştirme Ekranını Aç</Link></p>}
              {operationMessage && <p role="status">{operationMessage}</p>}
              <ol className={styles.flowGrid}>
                <li className={data.fulfillment?.picking_status === 'COMPLETED' ? styles.flowDone : styles.flowCard}>
                  <span className={styles.flowNumber}>1</span>
                  <strong>Hazırla</strong>
                  <p>{data.fulfillment ? (data.fulfillment.picking_status === "COMPLETED" ? "Ürünler hazırlandı." : "Hazırlama devam ediyor.") : "Siparişi depo hazırlamasına gönderin."}</p>
                  {canPrepare && preparationAction(data) === 'prepare' && <button type="button" disabled={operationBusy} onClick={() => void startPreparation()}>{operationBusy ? "Hazırlanıyor…" : "Hazırla"}</button>}
                </li>
                <li id="barkod" className={data.fulfillment?.packed_at ? styles.flowDone : styles.flowCard}>
                  <span className={styles.flowNumber}>2</span>
                  <strong>Paketle Ve Barkod Oluştur</strong>
                  <p>{data.fulfillment?.package_barcode ? `Paket barkodu: ${data.fulfillment.package_barcode}` : "Paket kapanınca barkod oluşur."}</p>
                  {canPrepare && preparationAction(data) === 'pack' && <button type="button" disabled={operationBusy} onClick={() => void startPreparation()}>{operationBusy ? "Paket Hazırlanıyor…" : "Paketle Ve Barkod Oluştur"}</button>}
                  {!data.fulfillment?.packed_at && data.fulfillment?.picking_status!=='COMPLETED' && <button type="button" disabled>Önce Ürünleri Hazırlayın</button>}
                  {data.fulfillment?.package_barcode && <details><summary>Paket İç Etiketi</summary><button type="button" className={styles.secondaryAction} onClick={() => printPackageBarcode(data.fulfillment!.package_barcode!)}>Paket İç Etiketini Yazdır</button></details>}
                </li>
                <li className={data.status === "SHIPPED" || data.status === "DELIVERED" ? styles.flowDone : styles.flowCard}>
                  <span className={styles.flowNumber}>3</span>
                  <strong>Aras Kaydı Ve Kargo Takibi</strong>
                  {automaticTracking&&data.shipments.some(s=>s.provider==='aras')&&<p>Gönderi Durumu Aras Kargo Üzerinden Otomatik Güncellenir.</p>}
                  <p>{data.fulfillment?.tracking_number ? `Takip Kodu: ${data.fulfillment.tracking_number}` : data.fulfillment?.shipment_status ? 'Kargo Kaydı Mevcut. Henüz Takip Numarası Yok; Bu Durum Fiziksel Teslimi Doğrulamaz.' : "Paket Hazırlandıktan Sonra Kargo Kaydını Oluşturun."}</p>
                  {canVerify && data.shipments.some(s=>s.provider==='aras') && <button type="button" className={styles.secondaryAction} disabled={operationBusy} onClick={()=>void verifyArasOnly()}>{operationBusy?'Aras Sorgulanıyor…':'Yalnız Aras Kaydını Sorgula'}</button>}
                  {canShip && preparationAction(data) === 'ship' && <button type="button" disabled={operationBusy} onClick={() => void createShipment()}>{operationBusy ? "Kargo Kaydı Açılıyor…" : "Kargo Kaydını Hazırla"}</button>}
                  {canShip && data.status === "PROCESSING" && data.fulfillment?.shipment_status === "CREATED" && arasCheck?.found === false && <button type="button" disabled={operationBusy} onClick={()=>void createShipment()}>{operationBusy?'Aras Kaydı Kontrol Ediliyor…':'Aras Kaydını Yeniden Gönder'}</button>}
                  {arasCheck?.found && arasCheck.orderNumber===data.order_number && <div className={styles.cardActions}><button type="button" className={styles.secondaryAction} onClick={()=>printPackageBarcode(arasCheck.integrationCode,true)}>Aras MÖK Barkodunu Yazdır</button><span>Mevcut Doğrulanmış Entegrasyon Kodu Basılır. Paket Kaydı Değişmez. 160 × 100 mm, Gerçek Boyutta Yazdırın.</span></div>}
                  {automaticTracking === false && canUpdateShipment && data.status === "PROCESSING" && data.fulfillment?.shipment_status === "CREATED" && <button type="button" disabled={operationBusy} onClick={() => void moveShipment("IN_TRANSIT", "SHIPPED")}>{operationBusy ? "Kaydediliyor…" : "Kargoya verildi olarak işaretle"}</button>}
                  {automaticTracking === false && canUpdateShipment && data.status === "SHIPPED" && data.fulfillment?.shipment_status === "IN_TRANSIT" && <button type="button" disabled={operationBusy} onClick={() => void moveShipment("DELIVERED", "DELIVERED")}>{operationBusy ? "Kaydediliyor…" : "Teslim edildi olarak işaretle"}</button>}
                </li>
              </ol>

              {arasCheck&&<div className={styles.tableWrap} role="status"><table><caption>Aras Servis Kontrolü — Yeni Gönderim Yapılmadı</caption><thead><tr><th>Sonuç</th><th>Entegrasyon Kodu</th><th>Paket Barkodu</th><th>Kontrol Zamanı</th></tr></thead><tbody><tr><td>{arasCheck.found?'Aras Servisinde Kayıt Ve Paket Barkodu Eşleşti. Portal Görünürlüğü Ve Şube Kabulü Ayrıca Doğrulanmalı.':'Aras Servisinde Kayıt Bulunamadı.'}</td><td>{arasCheck.integrationCode}</td><td>{arasCheck.packageBarcode}</td><td>{new Date(arasCheck.checkedAt).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</td></tr></tbody></table></div>}
            </section>
            <section className={`${styles.detailCard} ${styles.summaryCard}`}>
              <div className={styles.cardHeader}>
                <h2>Sipariş özeti</h2>
                <span className={`${styles.status} ${styles[`status_${displayStatus}`] ?? ""}`}>{orderStatus[displayStatus] ?? displayStatus}</span>
              </div>
              <div className={styles.summaryValues}>
                <div><small>Kapıda Ödeme Hizmet Bedeli</small><strong>{money(data.cod_service_fee??'0',data.currency)}</strong></div><div><small>Toplam tutar</small><strong>{money(data.total_amount, data.currency)}</strong></div>
                <div><small>Ödeme yöntemi</small><strong>{data.payments.map((payment) => paymentMethod[payment.provider] ?? payment.provider).join(", ") || "Belirtilmedi"}</strong></div>
              </div>
              <div className={styles.cardActions}>
                {canEdit && editableAdminChannels.includes(data.sales_channel) && data.status !== "CANCELLED" && <Link className={styles.financeLink} href={`/siparisler/${id}/duzenle`}>Siparişi düzenle</Link>}
                {canEdit && editableAdminChannels.includes(data.sales_channel) && ["PENDING_PAYMENT", "PROCESSING"].includes(data.status) && data.payments.length > 0 && data.payments.every((payment) => payment.status === "PENDING") && <button type="button" disabled={cancelling} onClick={() => void cancelOrder()}>{cancelling ? "İptal ediliyor…" : "Siparişi iptal et"}</button>}
                {canEdit && editableAdminChannels.includes(data.sales_channel) && ["PENDING_PAYMENT", "PROCESSING"].includes(data.status) && data.payments.length > 0 && data.payments.every((payment) => payment.status === "PENDING" && ["bank_transfer", "cash", "cash_on_delivery_card", "cash_on_delivery_cash"].includes(payment.provider)) && <Link className={styles.financeLink} href={`/siparisler/${id}/fiyatlar`}>Sipariş fiyatlarını değiştir</Link>}
              </div>
            </section>
            <section className={styles.detailCard}>
              {data.dealer_id && <div className={styles.cardActions}><strong>Siparişi Veren Bayi: {data.dealer_name || 'Bayi'}</strong><DealerLevelBadge name={data.dealer_level_name}/>{canViewDealer && <Link className={styles.secondaryAction} href={`/bayiler/${data.dealer_id}`}>Bayi Kartını Aç</Link>}</div>}
              <div id="musteri" className={styles.cardHeader}><h2>Müşteri Ve Teslimat</h2><span>Müşteri Kartı</span></div>
              {canViewCustomer && data.customer_id && <div className={styles.cardActions}><Link className={styles.secondaryAction} href={`/musteriler?customer=${encodeURIComponent(data.customer_id)}`}>Müşteri Kartı Ve Geçmiş Siparişleri Aç</Link></div>}
              <div className={styles.tableWrap}><table><thead><tr><th>Müşteri</th><th>E-Posta</th><th>Alıcı</th><th>Telefon</th><th>Teslimat Adresi</th></tr></thead><tbody><tr>
                <td>{data.contact_name ?? data.address?.recipient_name ?? 'Belirtilmedi'}</td>
                <td>{data.customer_email ?? 'Belirtilmedi'}</td>
                <td>{data.address?.recipient_name ?? 'Belirtilmedi'}</td>
                <td>{data.address?.phone ?? 'Belirtilmedi'}</td>
                <td>{data.address ? `${data.address.address_line}, ${data.address.district} / ${data.address.city} ${data.address.postal_code ?? ''}` : 'Teslimat Adresi Yok. Gönderim Yapmayın.'}</td>
              </tr></tbody></table></div>
            </section>
            <section className={`${styles.detailCard} ${styles.detailWide}`}>
            <div className={styles.cardHeader}><h2>Ürünler</h2><span>{data.items.length} ürün kalemi · Toplam {data.items.reduce((total,item) => total + item.quantity, 0)} adet</span></div>
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
                      <td className={styles.moneyCell}>{money(item.unit_amount, item.currency)}</td>
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
                    <th>Ödeme Yöntemi</th>
                    <th>Durum</th>
                    <th>Tutar</th>
                    <th>Oluşturuldu</th>
                    <th>Doğrulandı</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{paymentMethod[payment.provider] ?? payment.provider}</td>
                      <td>{paymentStatus[payment.status] ?? payment.status}</td>
                      <td className={styles.moneyCell}>{money(payment.amount, payment.currency)}</td>
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
              <details id="fatura" className={`${styles.detailCard} ${styles.detailWide} ${styles.foldCard}`}>
                <summary>Fatura İşlemleri</summary>
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
                <div className={styles.cardActions}><Link className={styles.financeLink} href={`/siparisler/${id}/fatura`} target="_blank" rel="noopener noreferrer">Fatura PDF Belgesini Aç / Yazdır</Link></div>
              </details>
            )}

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
                        <td>{{CREATED:'Kargo Kaydı Hazır',IN_TRANSIT:'Kargoda',DELIVERED:'Teslim Edildi',FAILED:'Kontrol Gerekiyor',CANCELLED:'İptal Edildi'}[shipment.status]??shipment.status}</td>
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
            {data.returns.length > 0 && <section className={styles.detailCard}>
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
                        <td>{returnStatus[item.status] ?? item.status}</td>
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
            </section>}
            <details className={styles.detailCard}>
            <summary>İşlem geçmişi</summary>
            {data.activity.length ? (
              <div className={styles.tableWrap}><table>
                <thead><tr><th>İşlem</th><th>İşlemi Yapan</th><th>Tarih</th></tr></thead>
                <tbody>{data.activity.map((item, index) => (
                  <tr key={`${item.action}-${item.created_at}-${index}`}>
                    <td>{activityLabel[item.action] ?? item.action}</td>
                    <td>{item.actor_email ?? "Sistem"}</td>
                    <td>{new Date(item.created_at).toLocaleString("tr-TR")}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : (
              <p className={styles.emptyNote}>Ek işlem kaydı yok.</p>
            )}
            </details>
            <details className={`${styles.detailCard} ${styles.detailWide}`}>
            <summary>Bağlı destek talepleri ({data.supportTickets.length})</summary>
            <div className={styles.cardActions}><Link className={styles.financeLink} href={`/destek?order=${id}`}>
              Bu sipariş için destek talebi aç
            </Link></div>
            {data.supportTickets.length ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Talep</th>
                      <th>Konu</th>
                      <th>Durum</th>
                      <th>Öncelik</th>
                      <th>Oluşturuldu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.supportTickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>
                          <Link className={styles.secondaryAction} href={`/destek?ticket=${ticket.id}`} aria-label={`${ticket.ticket_number} numaralı destek talebini aç`}>
                            {ticket.ticket_number}
                          </Link>
                        </td>
                        <td>{ticket.subject}</td>
                        <td>{supportStatus[ticket.status] ?? ticket.status}</td>
                        <td>{supportPriority[ticket.priority] ?? ticket.priority}</td>
                        <td>{new Date(ticket.created_at).toLocaleString('tr-TR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.emptyNote}>Bu siparişe bağlı destek talebi yok.</p>
            )}
            </details>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
