"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
import { downloadXlsx } from '../lib/xlsx';
type Config = { provider: string; ready: boolean; missing: string[] };
type Shipment = {
  id: string;
  order_id: string;
  order_number: string;
  provider: string;
  tracking_number: string | null;
  status: string;
  label_url: string | null;
  failure_reason: string | null;
  recipient_name: string | null;
  city: string | null;
  district: string | null;
  package_barcode: string | null;
  created_at: string;
};
type ShippingQueue = {
  order_id: string;
  order_number: string;
  total_amount: string;
  currency: string;
  recipient_name: string | null;
  city: string | null;
  district: string | null;
  package_barcode: string | null;
};
type ShipmentEvent = { id: string; status: string; description: string | null; occurred_at: string };
type ShipmentDetail = { order_id: string; events: ShipmentEvent[] };
const status: Record<string, string> = {
  PENDING: "Bekliyor",
  CREATED: "Gönderi oluşturuldu",
  IN_TRANSIT: "Taşımada",
  DELIVERED: "Teslim edildi",
  FAILED: "Başarısız",
  CANCELLED: "İptal edildi",
};
export default function Shipping() {
  const [config, setConfig] = useState<Config | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [queue, setQueue] = useState<ShippingQueue[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ShipmentDetail>>({});
  const [shipmentFilter, setShipmentFilter] = useState<"ALL" | "ACTIVE" | "DELIVERED" | "FAILED" | "CANCELLED">("ALL");
  const load = () =>
    Promise.all([
      api<Config>("/admin/orders/shipping/status"),
      api<Shipment[]>("/admin/orders/shipping"),
      api<ShippingQueue[]>("/admin/orders/shipping/queue"),
    ])
      .then(([c, s, q]) => {
        setConfig(c);
        setShipments(s);
        setQueue(q);
      })
      .catch((e) =>
        setMessage(
          e instanceof Error ? e.message : "Kargo kayıtları yüklenemedi",
        ),
      );
  useEffect(() => {
    void load();
  }, []);
  async function createShipment(orderId: string) {
    setBusy(orderId);
    try {
      const result = await api<{ trackingNumber: string }>(
        `/admin/orders/${orderId}/shipment`,
        { method: "POST" },
      );
      setMessage(`Kargo kaydı oluşturuldu: ${result.trackingNumber}`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kargo kaydı oluşturulamadı");
    } finally {
      setBusy(null);
    }
  }
  async function updateShipment(
    orderId: string,
    statusValue: "IN_TRANSIT" | "DELIVERED" | "FAILED" | "CANCELLED",
  ) {
    setBusy(orderId);
    try {
      await api(`/admin/orders/${orderId}/shipment/status`, {
        method: "POST",
        body: JSON.stringify({ status: statusValue }),
      });
      if (statusValue === "IN_TRANSIT" || statusValue === "DELIVERED") {
        await api(`/admin/orders/${orderId}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status: statusValue === "IN_TRANSIT" ? "SHIPPED" : "DELIVERED",
          }),
        });
      }
      setMessage(`Gönderi durumu güncellendi: ${status[statusValue]}`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gönderi durumu güncellenemedi");
    } finally {
      setBusy(null);
    }
  }
  async function loadHistory(orderId: string) {
    if (details[orderId]) {
      setDetails((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
      return;
    }
    setBusy(orderId);
    try {
      const detail = await api<ShipmentDetail | null>(`/admin/orders/${orderId}/shipment`);
      if (detail) setDetails((current) => ({ ...current, [orderId]: detail }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Takip geçmişi yüklenemedi");
    } finally {
      setBusy(null);
    }
  }
  const inTransit = shipments.filter(
    (s) => s.status === "CREATED" || s.status === "IN_TRANSIT",
  );
  const failed = shipments.filter((s) => s.status === "FAILED");
  const delivered = shipments.filter((s) => s.status === "DELIVERED");
  const visibleShipments = shipments.filter((shipment) => shipmentFilter === "ALL" || (shipmentFilter === "ACTIVE" && (shipment.status === "CREATED" || shipment.status === "IN_TRANSIT")) || shipment.status === shipmentFilter);
  function exportShipments() {
    if (!visibleShipments.length) { setMessage('Bu filtrede dışa aktarılacak gönderi bulunamadı.'); return; }
    const rows = [
      ['Sipariş no', 'Kargo firması', 'Takip no', 'Durum', 'Alıcı', 'İlçe', 'İl', 'Sorun notu', 'Oluşturulma'],
      ...visibleShipments.map(shipment => [shipment.order_number, shipment.provider, shipment.tracking_number ?? '', status[shipment.status] ?? shipment.status, shipment.recipient_name ?? '', shipment.district ?? '', shipment.city ?? '', shipment.failure_reason ?? '', new Date(shipment.created_at).toLocaleString('tr-TR')]),
    ];
    downloadXlsx('trex-kargo-gonderileri.xlsx', 'Kargo Gönderileri', rows);
  }
  return (
    <main>
      <AdminNav />
      <section>
        <p>SİPARİŞLER / KARGO</p>
        <h1>Kargo işlemleri</h1>
        {message && <p role="status">{message}</p>}
        <div className="cards">
          <article>
            <p>KARGOYA HAZIR</p>
            <h2>{queue.length}</h2>
            <p>Kayıt bekleyen paket</p>
          </article>
          <article>
            <p>TAŞIMADA</p>
            <h2>{inTransit.length}</h2>
            <p>Takip edilmesi gereken gönderi</p>
          </article>
          <article>
            <p>TESLİM EDİLDİ</p>
            <h2>{delivered.length}</h2>
            <p>Kapanan gönderi</p>
          </article>
          <article>
            <p>SORUNLU</p>
            <h2>{failed.length}</h2>
            <p>İşlem gerektiren gönderi</p>
          </article>
        </div>
        {config && (
          <article className="form-card">
            <h2>Aras Kargo bağlantısı</h2>
            <p>
              {config.provider === "aras"
                ? config.ready
                  ? "Bağlantı bilgileri hazır. İlk canlı gönderiden önce Aras SetOrder şeması doğrulanmalıdır."
                  : `Bağlantı eksik: ${config.missing.join(", ")}`
                : "Deneme kargo adaptörü seçili. Canlı gönderi oluşturmaz."}
            </p>
            <p>
              Canlı Aras gönderisi için Render ortam değişkenlerinde müşteri
              kodu, SetOrder kullanıcı adı/şifresi ve Aras’ın verdiği sözleşme
              endpoint’i bulunmalıdır.
            </p>
          </article>
        )}
        <h2>Kargoya hazır siparişler</h2>
        <p>
          Paketlemesi tamamlanan sipariş için kargo kaydı ve takip numarası
          oluşturun.
        </p>
        <div className="cards">
          {queue.length ? (
            queue.map((item) => (
              <article key={item.order_id}>
                <p>
                  {item.recipient_name ?? "Müşteri"} · {item.district ?? ""}{" "}
                  {item.city ?? ""}
                </p>
                <h2>{item.order_number}</h2>
                <p>
                  {item.total_amount} {item.currency}
                </p>
                <p>Paket barkodu: {item.package_barcode ?? "Paket barkodu yok"}</p>
                <button
                  disabled={busy !== null}
                  onClick={() => void createShipment(item.order_id)}
                >
                  Kargo kaydı oluştur
                </button>
              </article>
            ))
          ) : (
            <article>
              <p>Kargo kaydı bekleyen paketlenmiş sipariş yok.</p>
            </article>
          )}
        </div>
        {failed.length > 0 && (
          <>
            <h2>Sorunlu gönderiler</h2>
            <div className="cards">
              {failed.map((s) => (
                <article key={s.id}>
                  <p>
                    {s.order_number} ·{" "}
                    {s.tracking_number ?? "Takip numarası yok"}
                  </p>
                  <h3>{s.recipient_name ?? "Müşteri"}</h3>
                  <p role="alert">
                    {s.failure_reason ??
                      "Kargo sağlayıcısı gönderi kaydını oluşturamadı."}
                  </p>
                  <Link href={`/siparisler/${s.order_id}`}>Siparişi aç →</Link>
                </article>
              ))}
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2>Son gönderiler</h2>
          <label>Durum <select value={shipmentFilter} onChange={(event) => setShipmentFilter(event.target.value as typeof shipmentFilter)}><option value="ALL">Tümü</option><option value="ACTIVE">Aktif gönderiler</option><option value="DELIVERED">Teslim edildi</option><option value="FAILED">Sorunlu</option><option value="CANCELLED">İptal edildi</option></select></label>
          <button type="button" disabled={!visibleShipments.length} onClick={exportShipments}>Excel&apos;e Aktar</button>
        </div>
<div className="table-card"><div className="table-wrap"><table><thead><tr><th>Sipariş</th><th>Kargo Firması</th><th>Durum</th><th>Takip / Barkod</th><th>Alıcı</th><th>İl / İlçe</th><th>İşlemler</th><th>Takip Geçmişi</th></tr></thead><tbody>{visibleShipments.map(s=><tr key={s.id}><td><Link href={`/siparisler/${s.order_id}`}>{s.order_number}</Link></td><td>{s.provider==='aras'?'Aras Kargo':s.provider}</td><td>{status[s.status]??s.status}{s.failure_reason&&<small role="alert">{s.failure_reason}</small>}</td><td><b>{s.tracking_number??'Takip Bekleniyor'}</b><small>{s.package_barcode??'Barkod Yok'}</small></td><td>{s.recipient_name??'—'}</td><td>{s.city??'—'} / {s.district??'—'}</td><td><div className="button-row">{s.status==='CREATED'&&<><button disabled={busy!==null} onClick={()=>void updateShipment(s.order_id,'IN_TRANSIT')}>Kargoya Ver</button><button className="secondary" disabled={busy!==null} onClick={()=>void updateShipment(s.order_id,'CANCELLED')}>Gönderiyi İptal Et</button></>}{s.status==='IN_TRANSIT'&&<><button disabled={busy!==null} onClick={()=>void updateShipment(s.order_id,'DELIVERED')}>Teslim Edildi</button><button className="secondary" disabled={busy!==null} onClick={()=>void updateShipment(s.order_id,'FAILED')}>Teslimat Sorunu</button></>}<button className="secondary" disabled={busy!==null} onClick={()=>void loadHistory(s.order_id)}>Takip Geçmişi</button>{s.label_url&&<a href={s.label_url} target="_blank" rel="noopener noreferrer">Etiketi Aç</a>}</div></td><td>{details[s.order_id]?details[s.order_id].events.map(event=><p key={event.id}>{new Date(event.occurred_at).toLocaleString('tr-TR')} · {status[event.status]??event.status} {event.description??''}</p>):'Takip Geçmişi Butonuna Tıklayın'}</td></tr>)}</tbody></table>{!visibleShipments.length&&<p className="empty-state">Bu Duruma Ait Kargo Kaydı Yok.</p>}</div></div>
      </section>
    </main>
  );
}
