'use client';

import { useEffect, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';

type Integrity = {
  status: string; build: string; environment: string;
  migration: { name: string; applied_at: string } | null;
  dependencies: { database: string; queue: string };
  providers: Record<string, { configured: boolean; kind: string }>;
};
type Reconciliation = { status: 'ok' | 'attention'; checks: Record<string, number> };
type ReleaseReadiness = { status: 'ready' | 'attention'; checks: { productionEnvironment: boolean; publicSiteDomain: boolean; corsIncludesPublicDomain: boolean; legalDocumentCount: number; paymentConfigured: boolean; shippingConfigured: boolean; notificationConfigured: boolean; mediaStorageConfigured: boolean; invoicingConfigured: boolean }; blockers: string[] };

export default function SystemIntegrityPage() {
  const [data, setData] = useState<Integrity | null>(null);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [releaseReadiness, setReleaseReadiness] = useState<ReleaseReadiness | null>(null);
  const [message, setMessage] = useState('');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const load = () => Promise.all([api<Integrity>('/health/integrity'), api<Reconciliation>('/health/integrity/reconciliation'), api<ReleaseReadiness>('/health/integrity/release-readiness')]).then(([integrity, result, readiness]) => { setData(integrity); setReconciliation(result); setReleaseReadiness(readiness); setCheckedAt(new Date().toISOString()); }).catch(error => setMessage(error instanceof Error ? error.message : 'Sistem durumu alınamadı.'));
  useEffect(() => { void load(); }, []);
  return <main><AdminNav /><section><p>AYARLAR / SİSTEM BÜTÜNLÜĞÜ</p><h1>Çalışma zamanı durumu</h1><p>Bu ekran gizli anahtarları göstermez; yalnızca yayın, veri şeması ve bağımlılıkların hazır olup olmadığını özetler.</p>{checkedAt && <p>Son kontrol: {new Date(checkedAt).toLocaleString('tr-TR')}</p>}{message && <p role="alert">{message}</p>}{data && <><div className="summary-grid"><article><small>Yayın</small><strong>{data.build}</strong><span>{data.environment}</span></article><article><small>Veritabanı</small><strong>{data.dependencies.database === 'up' ? 'Hazır' : 'Kontrol gerekli'}</strong><span>Son migration: {data.migration?.name ?? 'Yok'}</span></article><article><small>Kuyruk</small><strong>{data.dependencies.queue === 'up' ? 'Hazır' : 'Kontrol gerekli'}</strong><span>Arka plan işleri</span></article></div><div className="form-card"><h2>Sağlayıcı hazırlığı</h2>{Object.entries(data.providers).map(([name, provider]) => <p key={name}><b>{name === 'payment' ? 'Ödeme' : name === 'shipping' ? 'Kargo' : name === 'notification' ? 'Bildirim' : name === 'media' ? 'Görsel depolama' : 'Fatura'}:</b> {provider.configured ? `Hazır (${provider.kind})` : 'Canlı sağlayıcı yapılandırılmamış'}</p>)}</div></>}{reconciliation && <div className="form-card"><h2>Operasyon uzlaştırması</h2><p><b>{reconciliation.status === 'ok' ? 'Kontrol temiz' : 'İnceleme gerekli'}</b> · Bu kontrol hiçbir kaydı değiştirmez.</p>{Object.entries(reconciliation.checks).map(([key, value]) => <p key={key}><b>{key === 'paymentsWithoutOrders' ? 'Siparişsiz başarılı ödeme' : key === 'paidOrdersWithoutPayments' ? 'Ödemesiz ödenmiş sipariş' : key === 'invalidInventory' ? 'Geçersiz stok bakiyesi' : key === 'cancelledReservations' ? 'İptal siparişte aktif rezervasyon' : 'Siparişsiz onaylı tahsilat'}:</b> {value}</p>)}</div>}{releaseReadiness && <div className="form-card"><h2>Canlıya hazırlık</h2><p><b>{releaseReadiness.status === 'ready' ? 'Yayın için teknik koşullar hazır' : 'Eksikler var'}</b> · Bu kontrol yalnızca okuma yapar.</p><p><b>Yayınlanmış yasal doküman:</b> {releaseReadiness.checks.legalDocumentCount}</p><p><b>Alan adı:</b> {releaseReadiness.checks.publicSiteDomain ? 'Hazır' : 'Kontrol gerekli'} · <b>CORS:</b> {releaseReadiness.checks.corsIncludesPublicDomain ? 'Hazır' : 'Kontrol gerekli'}</p><p><b>Görsel depolama:</b> {releaseReadiness.checks.mediaStorageConfigured ? 'Hazır' : 'Eksik'} · <b>E-posta:</b> {releaseReadiness.checks.notificationConfigured ? 'Hazır' : 'Eksik'} · <b>Paraşüt:</b> {releaseReadiness.checks.invoicingConfigured ? 'Hazır' : 'Eksik'}</p>{releaseReadiness.blockers.map(blocker => <p key={blocker} role="alert">• {blocker}</p>)}</div>}<button type="button" onClick={() => void load()}>Durumu yenile</button></section></main>;
}
