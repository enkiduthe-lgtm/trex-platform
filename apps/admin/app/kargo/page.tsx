"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../components/admin-nav";
import { useOrderPermissions } from '../lib/use-order-permissions';
import { api } from "../lib/api";
import styles from "./shipping.module.css";
import { downloadXlsx } from '../lib/xlsx';
type Config = { provider: string; ready: boolean; missing: string[];tracking?:{configured:boolean;enabled:boolean;intervalMinutes:number} };
type Shipment = {
  id: string;
  order_id: string;
  order_number: string;
  order_status?: string;
  provider: string;
  tracking_number: string | null;
  tracking_checked_at: string|null;
  tracking_error:string|null;
  tracking_direction_code?:string|null;
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
type ShipmentDetail = { order_id: string; events: ShipmentEvent[]; read_at?: string };
const status: Record<string, string> = {
  PENDING: "Bekliyor",
  CREATED: "Gönderi Oluşturuldu",
  IN_TRANSIT: "Taşımada",
  DELIVERED: "Teslim Edildi",
  FAILED: "Başarısız",
  CARRIER_RETURN: "Kargo İadesi",
  CANCELLED: "İptal Edildi",
};
const shipmentStage = (shipment: Shipment) => shipment.tracking_direction_code === '3' ? 'CARRIER_RETURN' : shipment.status;
const shipmentTracking = (shipment: Shipment) =>
  shipment.provider === 'aras' && shipment.tracking_number === shipment.order_number ? null : shipment.tracking_number;
const needsDeliveryReconciliation = (shipment:Shipment) => shipment.provider==='aras'&&shipment.status==='DELIVERED'&&['PROCESSING','SHIPPED'].includes(shipment.order_status??'')&&shipment.tracking_direction_code!=='3';
const canQueryTracking = (shipment:Shipment) => shipment.provider==='aras'&&shipment.tracking_direction_code!=='3'&&(['CREATED','IN_TRANSIT','FAILED'].includes(shipment.status)||needsDeliveryReconciliation(shipment));
const orderStatusText:Record<string,string>={PENDING_PAYMENT:'Ödeme Bekliyor',PAID:'Onaylandı',PROCESSING:'Hazırlanıyor',SHIPPED:'Kargoda',DELIVERED:'Teslim Edildi',CANCELLED:'İptal Edildi',REFUNDED:'İade Edildi'};
export default function Shipping() {
  const {permissions,role,loading:accessLoading,error:accessError,refresh:refreshPermissions}=useOrderPermissions();
  const actionLock=useRef(false);
  const alive=useRef(true);
  const readVersion=useRef(0);
  const readyRef=useRef(false);
  const readInFlight=useRef(false);
  const lastReadAt=useRef<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [loaded,setLoaded]=useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [queue, setQueue] = useState<ShippingQueue[]>([]);
  const [message, setMessage] = useState("");
  const [loadError,setLoadError]=useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ShipmentDetail>>({});
  const [shipmentFilter, setShipmentFilter] = useState<"ALL" | "ACTIVE" | "RECONCILE" | "DELIVERED" | "FAILED" | "CARRIER_RETURN" | "CANCELLED">("ALL");
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const validDates=!dateFrom||!dateTo||dateFrom<=dateTo;
  const load = async (background = false) => {
    if(background&&(!alive.current||readInFlight.current||actionLock.current))return false;
    const version=++readVersion.current;
    readInFlight.current=true;
    if(!background){readyRef.current=false;setLoading(true);setLoaded(false);setLoadError('');setDetails({});}
    try {
      const [c,s,q]=await Promise.all([
        api<Config>("/admin/orders/shipping/status"),
        api<Shipment[]>("/admin/orders/shipping"),
        api<ShippingQueue[]>("/admin/orders/shipping/queue"),
      ]);
      if(!alive.current||version!==readVersion.current||background&&actionLock.current)return false;
      if(!c||typeof c.provider!=='string'||!Array.isArray(s)||!Array.isArray(q))throw new Error('Kargo kayıtları doğrulanamadı.');
      setConfig(c);setShipments(s);setQueue(q);setLoaded(true);setLoadError('');readyRef.current=true;lastReadAt.current=new Date().toISOString();
      return true;
    } catch(e) {
      if(alive.current&&version===readVersion.current&&(!background||!actionLock.current)){readyRef.current=false;setLoaded(false);setLoadError(e instanceof Error?e.message:'Kargo kayıtları yüklenemedi.');}
      return false;
    } finally {
      if(alive.current&&version===readVersion.current){readInFlight.current=false;if(!background)setLoading(false);}
    }
  };
  useEffect(() => {
    alive.current=true;
    void load();
    return()=>{alive.current=false;readyRef.current=false;readVersion.current++;};
  }, []);
  useEffect(()=>{
    const refresh=()=>{
      if(!alive.current||document.visibilityState!=='visible'||actionLock.current||readInFlight.current)return;
      void load(true);
    };
    const timer=window.setInterval(refresh,30_000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  async function syncShipment(orderId:string) {
    if(actionLock.current||!readyRef.current||accessLoading||role!=='SUPER_ADMIN'||!config?.tracking?.configured)return;
    const target=shipments.find(row=>row.order_id===orderId);
    if(!target||!canQueryTracking(target))return;
    actionLock.current=true;setBusy(orderId);setMessage('');
    try {
      const result=await api<{configured?:boolean;busy?:boolean;checked:number;updated:number;failed:number}>(`/admin/orders/${orderId}/shipment/sync`,{method:'POST'});
      if(!alive.current)return;
      if(result.busy)setMessage('Başka bir Aras kontrolü sürüyor. Biraz sonra kayıtları yenileyin.');
      else if(result.configured===false)setMessage('Aras takip sorgulama ayarları eksik.');
      else if(!Number.isInteger(result.checked)||!Number.isInteger(result.updated)||!Number.isInteger(result.failed))throw new Error('Aras kontrol sonucu doğrulanamadı.');
      else if(result.failed>0)setMessage(`${target.order_number}: Aras sorgusu tamamlanamadı. Son kayıtlı durum korunuyor; satırdaki kontrol notunu inceleyin.`);
      else if(result.checked===0)setMessage(`${target.order_number}: Kontrol edilecek aktif gönderi bulunamadı. Liste yenileniyor.`);
      else if(result.updated===0)setMessage(`${target.order_number}: Aras henüz gönderi hareketi bildirmedi. Son kayıtlı durum korunuyor.`);
      else setMessage(`${target.order_number}: Takip bilgisi Aras yanıtıyla güncellendi. Yeni gönderi oluşturulmadı.`);
      await load();
    } catch(e) {
      if(alive.current)setMessage(e instanceof Error?e.message:'Aras kontrolü tamamlanamadı.');
    } finally {actionLock.current=false;if(alive.current)setBusy(null);}
  }
  async function createShipment(orderId: string) {
    if(actionLock.current||!readyRef.current||accessLoading||!permissions.ship||!queue.some(row=>row.order_id===orderId))return;
    actionLock.current=true;
    setBusy(orderId);
    try {
      const result = await api<{ trackingNumber: string | null; replayed?: boolean }>(
        `/admin/orders/${orderId}/shipment`,
        { method: "POST" },
      );
      if(!alive.current)return;
      setMessage(result.replayed ? "Mevcut kargo kaydı doğrulandı." : result.trackingNumber?`Kargo Kaydı Oluşturuldu: ${result.trackingNumber}`:'Aras kaydı doğrulandı. Şube kabulü ve takip numarası bekleniyor.');
      await load();
    } catch (e) {
      if(alive.current)setMessage(e instanceof Error ? e.message : "Kargo kaydı oluşturulamadı");
    } finally {
      actionLock.current=false;
      if(alive.current)setBusy(null);
    }
  }
  async function updateShipment(
    orderId: string,
    statusValue: "IN_TRANSIT" | "DELIVERED" | "FAILED" | "CANCELLED",
  ) {
    if(actionLock.current||!readyRef.current||accessLoading||!permissions.updateShipment||!shipments.some(row=>row.order_id===orderId))return;
    actionLock.current=true;
    setBusy(orderId);
    try {
      await api(`/admin/orders/${orderId}/shipment/status`, {
        method: "POST",
        body: JSON.stringify({ status: statusValue }),
      });
      if(!alive.current)return;
      setMessage(`Gönderi durumu güncellendi: ${status[statusValue]}`);
      await load();
    } catch (e) {
      if(alive.current)setMessage(e instanceof Error ? e.message : "Gönderi durumu güncellenemedi");
    } finally {
      actionLock.current=false;
      if(alive.current)setBusy(null);
    }
  }
  async function loadHistory(orderId: string, refresh = false) {
    if(actionLock.current||!readyRef.current)return;
    const version=readVersion.current;
    if (details[orderId]&&!refresh) {
      setDetails((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
      return;
    }
    actionLock.current=true;
    setBusy(orderId);
    try {
      const detail = await api<ShipmentDetail | null>(`/admin/orders/${orderId}/shipment`);
      if(!alive.current||version!==readVersion.current)return;
      if(!detail||detail.order_id!==orderId||!Array.isArray(detail.events))throw new Error('Gönderi hareketleri doğrulanamadı.');
      setDetails((current) => ({ ...current, [orderId]: {...detail,read_at:new Date().toISOString()} }));
    } catch (e) {
      if(alive.current&&version===readVersion.current)setMessage(e instanceof Error ? e.message : "Takip geçmişi yüklenemedi");
    } finally {
      actionLock.current=false;
      if(alive.current)setBusy(null);
    }
  }
  const registered=shipments.filter(s=>shipmentStage(s)==='CREATED');
  const inTransit=shipments.filter(s=>shipmentStage(s)==='IN_TRANSIT');
  const failed = shipments.filter(s=>shipmentStage(s)==='FAILED');
  const delivered = shipments.filter(s=>shipmentStage(s)==='DELIVERED');
  const returned = shipments.filter(s=>shipmentStage(s)==='CARRIER_RETURN');
  const visibleShipments = shipments.filter(shipment=>{
    const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date(shipment.created_at));
    return validDates&&(!dateFrom||day>=dateFrom)&&(!dateTo||day<=dateTo);
  }).filter((shipment) => {
    const stage = shipmentStage(shipment);
    return shipmentFilter === "ALL" || (shipmentFilter === "ACTIVE" && (stage === "CREATED" || stage === "IN_TRANSIT")) || (shipmentFilter==='RECONCILE'&&needsDeliveryReconciliation(shipment)) || stage === shipmentFilter;
  });
  function exportShipments() {
    if(loading||!loaded)return;
    if (!visibleShipments.length) { setMessage('Bu filtrede dışa aktarılacak gönderi bulunamadı.'); return; }
    const rows = [
      ['Kapsam','Ekrandaki filtrelerle gösterilen gönderiler'],['Veri zamanı',lastReadAt.current?new Date(lastReadAt.current).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'Henüz doğrulanmadı'],['Başlangıç tarihi',dateFrom||'Sınır yok'],['Bitiş tarihi',dateTo||'Sınır yok'],[],
      ['Sipariş no', 'Kargo firması', 'Takip no', 'Kargo durumu', 'Sipariş durumu', 'Alıcı', 'İlçe', 'İl', 'Kontrol / sorun notu', 'Oluşturulma'],
      ...visibleShipments.map(shipment => [shipment.order_number, shipment.provider==='aras'?'Aras Kargo':shipment.provider, shipmentTracking(shipment) ?? '', status[shipmentStage(shipment)] ?? shipmentStage(shipment),orderStatusText[shipment.order_status??'']??shipment.order_status??'Alınmadı', shipment.recipient_name ?? '', shipment.district ?? '', shipment.city ?? '', [needsDeliveryReconciliation(shipment)?'Sipariş teslimi doğrulanmalı':null,shipment.tracking_error,shipment.failure_reason].filter(Boolean).join(' · '), new Date(shipment.created_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})]),
    ];
    downloadXlsx('trex-kargo-gonderileri.xlsx', 'Kargo Gönderileri', rows);
  }
  return (
    <main>
      <AdminNav />
      <section className={styles.page}>
        <p>Siparişler / Kargo</p>
        <header className={styles.toolbar}><h1>Kargo İşlemleri</h1><button type="button" disabled={loading||busy!==null} onClick={()=>void load()}>{loading?'Yükleniyor…':'Kayıtları Yenile'}</button></header>
        <p>Bu ekran açıkken gönderi listesi 30 saniyede bir yenilenir. Aras sorguları, API servisi çalışırken kendi takip aralığında yapılır.{lastReadAt.current&&<> Son liste yenileme: {new Date(lastReadAt.current).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}.</>}</p>
        {accessError&&<div role="alert"><p>{accessError}</p><button type="button" onClick={()=>void refreshPermissions()}>İşlem Yetkilerini Yenile</button></div>}
        {message && <p role="status">{message}</p>}
        {loadError&&<p role="alert">{loadError} Son yüklenen kayıtlar gösteriliyor. Güncel liste doğrulanana kadar işlem yapılamaz.</p>}
        {loading&&<p role="status">Kargo Bilgileri Yükleniyor…</p>}
        <div className={styles.summary}><article><p>KARGO KAYDI HAZIR</p><h2>{loaded?registered.length:'—'}</h2><p>Şube Kabulü / Takip Bekleniyor</p></article>
          <article>
            <p>KARGOYA HAZIR</p>
            <h2>{loaded?queue.length:'—'}</h2>
            <p>Kayıt bekleyen paket</p>
          </article>
          <article>
            <p>TAŞIMADA</p>
            <h2>{loaded?inTransit.length:'—'}</h2>
            <p>Takip edilmesi gereken gönderi</p>
          </article>
          <article>
            <p>TESLİM EDİLDİ</p>
            <h2>{loaded?delivered.length:'—'}</h2>
            <p>Kapanan gönderi</p>
          </article>
          <article>
            <p>SORUNLU</p>
            <h2>{loaded?failed.length:'—'}</h2>
            <p>İşlem gerektiren gönderi</p>
          </article>
          <article>
            <p>KARGO İADESİ</p>
            <h2>{loaded?returned.length:'—'}</h2>
            <p>Aras tarafından bildirilen iadeler</p>
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
        <section className="form-card"><h2>Aras Otomatik Takip</h2><p>{!config?'Takip ayarları henüz doğrulanmadı.':config.tracking?.configured?(config.tracking.enabled?'Otomatik Takip Açık · Servis Çalışırken 5 Dakikada Bir Kontrol':'Sorgulama Bilgileri Hazır · Otomatik Takip Kapalı'):'Sorgulama Servisi Ayarları Bekleniyor'}</p><p>Son kontrol ve sorgu sorunları gönderi satırında gösterilir. Müdür, aktif gönderiyi “Aras’tan Sorgula” düğmesiyle tek tek kontrol edebilir. Yeni gönderi oluşturulmaz.</p></section><h2>Kargoya Hazır Siparişler</h2>
        <p>
          Paketlemesi tamamlanan sipariş için kargo kaydı ve takip numarası
          oluşturun.
        </p>
        <section className="table-card"><div className="table-wrap"><table><thead><tr><th>Sipariş</th><th>Alıcı</th><th>İl / İlçe</th><th>Sipariş Toplamı</th><th>Paket Barkodu</th><th>İşlem</th></tr></thead><tbody>{queue.map(item=><tr key={item.order_id}><td><Link href={`/siparisler/${item.order_id}`}>{item.order_number}</Link></td><td>{item.recipient_name??'—'}</td><td>{item.city??'—'} / {item.district??'—'}</td><td>{Number(item.total_amount).toLocaleString('tr-TR',{style:'currency',currency:item.currency})}</td><td>{item.package_barcode??'Paket Barkodu Yok'}</td><td><div className={styles.actions}>{permissions.ship&&<button type="button" disabled={accessLoading||busy!==null||!loaded} onClick={()=>void createShipment(item.order_id)}>Kargo Kaydı Oluştur</button>}<Link href={`/siparisler/${item.order_id}`}>Siparişi Aç</Link></div></td></tr>)}</tbody></table>{!queue.length&&<p className="empty-state">{loading?'Yükleniyor…':loaded?'Kargo Kaydı Bekleyen Paketlenmiş Sipariş Yok.':'Kargo Kuyruğu Yüklenemedi. Kayıtları Yenileyin.'}</p>}</div></section>
        {failed.length>0&&<section className="table-card"><h2>Sorunlu Gönderiler</h2><div className="table-wrap"><table><thead><tr><th>Sipariş</th><th>Alıcı</th><th>Takip Numarası</th><th>Sorun</th><th>İşlem</th></tr></thead><tbody>{failed.map(item=><tr key={item.id}><td>{item.order_number}</td><td>{item.recipient_name??'—'}</td><td>{shipmentTracking(item)??'Takip Bekleniyor'}</td><td>{item.failure_reason??item.tracking_error??'Kargo Kaydı Kontrol Edilmeli'}</td><td><Link href={`/siparisler/${item.order_id}`}>Siparişi Aç</Link></td></tr>)}</tbody></table></div></section>}
        <div className={styles.toolbar}>
          <h2>Son Gönderiler</h2><label>Başlangıç Tarihi<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label>Bitiş Tarihi<input type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)}/></label>
          <label>Durum <select value={shipmentFilter} onChange={(event) => setShipmentFilter(event.target.value as typeof shipmentFilter)}><option value="ALL">Tümü</option><option value="ACTIVE">Aktif gönderiler</option><option value="RECONCILE">Sipariş Teslimi Eşleşmeyenler</option><option value="DELIVERED">Teslim edildi</option><option value="FAILED">Sorunlu</option><option value="CARRIER_RETURN">Kargo iadesi</option><option value="CANCELLED">İptal edildi</option></select></label>
          <button type="button" disabled={loading||!loaded||!validDates||!visibleShipments.length} onClick={exportShipments}>Excel&apos;e Aktar</button>
        </div>
{!validDates&&<p role="alert">Bitiş Tarihi Başlangıç Tarihinden Önce Olamaz.</p>}<div className="table-card"><div className="table-wrap"><table><thead><tr><th>Sipariş</th><th>Kargo Firması</th><th>Durum</th><th>Takip / Barkod</th><th>Alıcı</th><th>İl / İlçe</th><th>İşlemler</th><th>Takip Geçmişi</th></tr></thead><tbody>{visibleShipments.map(s=><tr key={s.id}><td><Link href={`/siparisler/${s.order_id}`}>{s.order_number}</Link></td><td>{s.provider==='aras'?'Aras Kargo':s.provider}</td><td>{status[shipmentStage(s)]??shipmentStage(s)}{needsDeliveryReconciliation(s)&&<small>Siparişin teslim durumu henüz eşleşmedi.</small>}{s.tracking_checked_at&&<small>Son Kontrol: {new Date(s.tracking_checked_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</small>}{s.tracking_error&&<small role="alert">{s.tracking_error}</small>}{s.failure_reason&&<small role="alert">{s.failure_reason}</small>}</td><td><b>{shipmentTracking(s)??'Takip Bekleniyor'}</b><small>{s.package_barcode??'Barkod Yok'}</small></td><td>{s.recipient_name??'—'}</td><td>{s.city??'—'} / {s.district??'—'}</td><td><div className={styles.actions}>{role==='SUPER_ADMIN'&&config?.tracking?.configured&&canQueryTracking(s)&&<button type="button" className="secondary" disabled={busy!==null||!loaded||accessLoading} onClick={()=>void syncShipment(s.order_id)}>{busy===s.order_id?'Sorgulanıyor…':'Aras’tan Sorgula'}</button>}{permissions.updateShipment&&!(s.provider==='aras'&&config?.tracking?.enabled&&config.tracking.configured)&&shipmentStage(s)==='CREATED'&&<><button disabled={busy!==null||!loaded||accessLoading} onClick={()=>void updateShipment(s.order_id,'IN_TRANSIT')}>Kargoya Ver</button><button className="secondary" disabled={busy!==null||!loaded||accessLoading} onClick={()=>void updateShipment(s.order_id,'CANCELLED')}>Gönderiyi İptal Et</button></>}{permissions.updateShipment&&!(s.provider==='aras'&&config?.tracking?.enabled&&config.tracking.configured)&&shipmentStage(s)==='IN_TRANSIT'&&<><button disabled={busy!==null||!loaded||accessLoading} onClick={()=>void updateShipment(s.order_id,'DELIVERED')}>Teslim Edildi</button><button className="secondary" disabled={busy!==null||!loaded||accessLoading} onClick={()=>void updateShipment(s.order_id,'FAILED')}>Teslimat Sorunu</button></>}<button className="secondary" disabled={busy!==null||!loaded||accessLoading} onClick={()=>void loadHistory(s.order_id)}>{details[s.order_id]?'Geçmişi Kapat':'Takip Geçmişi'}</button>{details[s.order_id]&&<button type="button" className="secondary" disabled={busy!==null||!loaded||accessLoading} onClick={()=>void loadHistory(s.order_id,true)}>Geçmişi Yenile</button>}{s.label_url&&<a href={s.label_url} target="_blank" rel="noopener noreferrer">Etiketi Aç</a>}</div></td><td>{details[s.order_id]?<table className={styles.history}><caption>Hareketler · {details[s.order_id].read_at?new Date(details[s.order_id].read_at!).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'Açıldığı andaki kayıtlar'}</caption><thead><tr><th>Tarih</th><th>Durum</th><th>Açıklama</th></tr></thead><tbody>{details[s.order_id].events.map(event=><tr key={event.id}><td>{new Date(event.occurred_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</td><td>{status[event.status]??event.status}</td><td>{event.description??'—'}</td></tr>)}</tbody></table>:'Takip Geçmişi Butonuna Tıklayın'}</td></tr>)}</tbody></table>{!visibleShipments.length&&<p className="empty-state">{loading?'Yükleniyor…':loaded?'Bu Duruma Ait Kargo Kaydı Yok.':'Kargo Kayıtları Yüklenemedi. Kayıtları Yenileyin.'}</p>}</div></div>
      </section>
    </main>
  );
}
