"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../components/admin-nav";
import { api } from "../lib/api";
import styles from "./shipping.module.css";
import { downloadXlsx } from '../lib/xlsx';
type Config = { provider: string; ready: boolean; missing: string[];tracking?:{configured:boolean;enabled:boolean;intervalMinutes:number} };
type Shipment = {
  id: string;
  order_id: string;
  order_number: string;
  provider: string;
  tracking_number: string | null;
  tracking_checked_at: string|null;
  tracking_error:string|null;
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
  CREATED: "Gönderi Oluşturuldu",
  IN_TRANSIT: "Taşımada",
  DELIVERED: "Teslim Edildi",
  FAILED: "Başarısız",
  CANCELLED: "İptal Edildi",
};
export default function Shipping() {
  const [config, setConfig] = useState<Config | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [queue, setQueue] = useState<ShippingQueue[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ShipmentDetail>>({});
  const [shipmentFilter, setShipmentFilter] = useState<"ALL" | "ACTIVE" | "DELIVERED" | "FAILED" | "CANCELLED">("ALL");
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const validDates=!dateFrom||!dateTo||dateFrom<=dateTo;
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
  const visibleShipments = shipments.filter(shipment=>{
    const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date(shipment.created_at));
    return validDates&&(!dateFrom||day>=dateFrom)&&(!dateTo||day<=dateTo);
  }).filter((shipment) => shipmentFilter === "ALL" || (shipmentFilter === "ACTIVE" && (shipment.status === "CREATED" || shipment.status === "IN_TRANSIT")) || shipment.status === shipmentFilter);
  function exportShipments() {
    if (!visibleShipments.length) { setMessage('Bu filtrede dışa aktarılacak gönderi bulunamadı.'); return; }
    const rows = [
      ['Sipariş no', 'Kargo firması', 'Takip no', 'Durum', 'Alıcı', 'İlçe', 'İl', 'Sorun notu', 'Oluşturulma'],
      ...visibleShipments.map(shipment => [shipment.order_number, shipment.provider, shipment.tracking_number ?? '', status[shipment.status] ?? shipment.status, shipment.recipient_name ?? '', shipment.district ?? '', shipment.city ?? '', shipment.failure_reason ?? '', new Date(shipment.created_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})]),
    ];
    downloadXlsx('trex-kargo-gonderileri.xlsx', 'Kargo Gönderileri', rows);
  }
  return (
    <main>
      <AdminNav />
      <section className={styles.page}>
        <p>Siparişler / Kargo</p>
        <header className={styles.toolbar}><h1>Kargo İşlemleri</h1><button type="button" disabled={busy!==null} onClick={()=>void load()}>Kayıtları Yenile</button></header>
        {message && <p role="status">{message}</p>}
        <div className={styles.summary}>
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
            <h2>Aras Kargo Bağlantısı</h2>
            <p>
              {config.provider === "aras"
                ? config.ready
                  ? "Bağlantı Bilgileri Kayıtlı."
                  : "Bağlantı Bilgileri Eksik."
                : "Deneme Bağlantısı Seçili. Gerçek Gönderi Oluşturulmaz."}
            </p>
            <p>
              Kargo Kaydı Oluşturmadan Önce Teslimat Adresini Ve Paket Bilgilerini Kontrol Edin.
            </p>
          </article>
        )}
        <section className="form-card"><h2>Aras Otomatik Takip</h2><p>{config?.tracking?.configured?(config.tracking.enabled?'Otomatik Takip Açık · Servis Çalışırken 5 Dakikada Bir Kontrol':'Sorgulama Bilgileri Hazır · Otomatik Takip Kapalı'):'Sorgulama Servisi Ayarları Bekleniyor'}</p><p>Son Kontrol Tarihi Ve Sorgu Sorunları Gönderi Satırında Gösterilir.</p></section><h2>Kargoya Hazır Siparişler</h2>
        <p>
          Paketlemesi tamamlanan sipariş için kargo kaydı ve takip numarası
          oluşturun.
        </p>
        <section className="table-card"><div className="table-wrap"><table><thead><tr><th>Sipariş</th><th>Alıcı</th><th>İl / İlçe</th><th>Sipariş Toplamı</th><th>Paket Barkodu</th><th>İşlem</th></tr></thead><tbody>{queue.map(item=><tr key={item.order_id}><td><Link href={`/siparisler/${item.order_id}`}>{item.order_number}</Link></td><td>{item.recipient_name??'—'}</td><td>{item.city??'—'} / {item.district??'—'}</td><td>{Number(item.total_amount).toLocaleString('tr-TR',{style:'currency',currency:item.currency})}</td><td>{item.package_barcode??'Paket Barkodu Yok'}</td><td><div className={styles.actions}><button type="button" disabled={busy!==null} onClick={()=>void createShipment(item.order_id)}>Kargo Kaydı Oluştur</button><Link href={`/siparisler/${item.order_id}`}>Siparişi Aç</Link></div></td></tr>)}</tbody></table>{!queue.length&&<p className="empty-state">Kargo Kaydı Bekleyen Paketlenmiş Sipariş Yok.</p>}</div></section>
        {failed.length>0&&<section className="table-card"><h2>Sorunlu Gönderiler</h2><div className="table-wrap"><table><thead><tr><th>Sipariş</th><th>Alıcı</th><th>Takip Numarası</th><th>Sorun</th><th>İşlem</th></tr></thead><tbody>{failed.map(item=><tr key={item.id}><td>{item.order_number}</td><td>{item.recipient_name??'—'}</td><td>{item.tracking_number??'Takip Bekleniyor'}</td><td>{item.failure_reason??item.tracking_error??'Kargo Kaydı Kontrol Edilmeli'}</td><td><Link href={`/siparisler/${item.order_id}`}>Siparişi Aç</Link></td></tr>)}</tbody></table></div></section>}
        <div className={styles.toolbar}>
          <h2>Son Gönderiler</h2><label>Başlangıç Tarihi<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label>Bitiş Tarihi<input type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)}/></label>
          <label>Durum <select value={shipmentFilter} onChange={(event) => setShipmentFilter(event.target.value as typeof shipmentFilter)}><option value="ALL">Tümü</option><option value="ACTIVE">Aktif gönderiler</option><option value="DELIVERED">Teslim edildi</option><option value="FAILED">Sorunlu</option><option value="CANCELLED">İptal edildi</option></select></label>
          <button type="button" disabled={!validDates||!visibleShipments.length} onClick={exportShipments}>Excel&apos;e Aktar</button>
        </div>
{!validDates&&<p role="alert">Bitiş Tarihi Başlangıç Tarihinden Önce Olamaz.</p>}<div className="table-card"><div className="table-wrap"><table><thead><tr><th>Sipariş</th><th>Kargo Firması</th><th>Durum</th><th>Takip / Barkod</th><th>Alıcı</th><th>İl / İlçe</th><th>İşlemler</th><th>Takip Geçmişi</th></tr></thead><tbody>{visibleShipments.map(s=><tr key={s.id}><td><Link href={`/siparisler/${s.order_id}`}>{s.order_number}</Link></td><td>{s.provider==='aras'?'Aras Kargo':s.provider}</td><td>{status[s.status]??s.status}{s.tracking_checked_at&&<small>Son Kontrol: {new Date(s.tracking_checked_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</small>}{s.tracking_error&&<small role="alert">{s.tracking_error}</small>}{s.failure_reason&&<small role="alert">{s.failure_reason}</small>}</td><td><b>{s.tracking_number??'Takip Bekleniyor'}</b><small>{s.package_barcode??'Barkod Yok'}</small></td><td>{s.recipient_name??'—'}</td><td>{s.city??'—'} / {s.district??'—'}</td><td><div className={styles.actions}>{!(s.provider==='aras'&&config?.tracking?.enabled&&config.tracking.configured)&&s.status==='CREATED'&&<><button disabled={busy!==null} onClick={()=>void updateShipment(s.order_id,'IN_TRANSIT')}>Kargoya Ver</button><button className="secondary" disabled={busy!==null} onClick={()=>void updateShipment(s.order_id,'CANCELLED')}>Gönderiyi İptal Et</button></>}{!(s.provider==='aras'&&config?.tracking?.enabled&&config.tracking.configured)&&s.status==='IN_TRANSIT'&&<><button disabled={busy!==null} onClick={()=>void updateShipment(s.order_id,'DELIVERED')}>Teslim Edildi</button><button className="secondary" disabled={busy!==null} onClick={()=>void updateShipment(s.order_id,'FAILED')}>Teslimat Sorunu</button></>}<button className="secondary" disabled={busy!==null} onClick={()=>void loadHistory(s.order_id)}>Takip Geçmişi</button>{s.label_url&&<a href={s.label_url} target="_blank" rel="noopener noreferrer">Etiketi Aç</a>}</div></td><td>{details[s.order_id]?<table className={styles.history}><thead><tr><th>Tarih</th><th>Durum</th><th>Açıklama</th></tr></thead><tbody>{details[s.order_id].events.map(event=><tr key={event.id}><td>{new Date(event.occurred_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</td><td>{status[event.status]??event.status}</td><td>{event.description??'—'}</td></tr>)}</tbody></table>:'Takip Geçmişi Butonuna Tıklayın'}</td></tr>)}</tbody></table>{!visibleShipments.length&&<p className="empty-state">Bu Duruma Ait Kargo Kaydı Yok.</p>}</div></div>
      </section>
    </main>
  );
}
