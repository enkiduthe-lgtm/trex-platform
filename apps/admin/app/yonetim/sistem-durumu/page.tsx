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

export default function SystemIntegrityPage() {
  const [data, setData] = useState<Integrity | null>(null);
  const [message, setMessage] = useState('');
  const load = () => api<Integrity>('/health/integrity').then(setData).catch(error => setMessage(error instanceof Error ? error.message : 'Sistem durumu alınamadı.'));
  useEffect(() => { void load(); }, []);
  return <main><AdminNav /><section><p>AYARLAR / SİSTEM BÜTÜNLÜĞÜ</p><h1>Çalışma zamanı durumu</h1><p>Bu ekran gizli anahtarları göstermez; yalnızca yayın, veri şeması ve bağımlılıkların hazır olup olmadığını özetler.</p>{message && <p role="alert">{message}</p>}{data && <><div className="summary-grid"><article><small>Yayın</small><strong>{data.build}</strong><span>{data.environment}</span></article><article><small>Veritabanı</small><strong>{data.dependencies.database === 'up' ? 'Hazır' : 'Kontrol gerekli'}</strong><span>Son migration: {data.migration?.name ?? 'Yok'}</span></article><article><small>Kuyruk</small><strong>{data.dependencies.queue === 'up' ? 'Hazır' : 'Kontrol gerekli'}</strong><span>Arka plan işleri</span></article></div><div className="form-card"><h2>Sağlayıcı hazırlığı</h2>{Object.entries(data.providers).map(([name, provider]) => <p key={name}><b>{name === 'payment' ? 'Ödeme' : name === 'shipping' ? 'Kargo' : 'Bildirim'}:</b> {provider.configured ? `Hazır (${provider.kind})` : 'Canlı sağlayıcı yapılandırılmamış'}</p>)}</div></>}<button type="button" onClick={() => void load()}>Durumu yenile</button></section></main>;
}
