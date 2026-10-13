'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';

type Alert = { code: string; title: string; detail: string; severity: 'HIGH' | 'MEDIUM' | 'LOW' };
const labels: Record<Alert['severity'], string> = { HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük' };

export default function FinanceAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<'ALL' | Alert['severity']>('ALL');
  const [message, setMessage] = useState('');
  const load = () => { setMessage(''); return api<Alert[]>('/admin/finance/alerts').then(setAlerts).catch(error => setMessage(error instanceof Error ? error.message : 'Finans uyarıları yüklenemedi.')); };
  useEffect(() => { void load(); }, []);
  const shown = useMemo(() => alerts.filter(alert => filter === 'ALL' || alert.severity === filter), [alerts, filter]);
  return <main><AdminNav /><section>
    <p>FİNANS / OPERASYON UYARILARI</p><h1>Finans kontrol merkezi</h1>
    <p>Bu ekran otomatik düzeltme yapmaz. Uyarıları ilgili hesap veya tahsilat kaydından kontrollü olarak çözün.</p>
    <p><Link href="/finans">← Finans özetine dön</Link> · <Link href="/finans/havaleler">Bekleyen havaleler</Link> · <Link href="/finans/masraflar">Masraflar</Link></p>
    {message && <p role="alert">{message}</p>}
    <div className="cards"><article><p>TOPLAM UYARI</p><h2>{alerts.length}</h2></article><article><p>YÜKSEK ÖNCELİK</p><h2>{alerts.filter(alert => alert.severity === 'HIGH').length}</h2></article><article><p>GÖSTERİLEN</p><h2>{shown.length}</h2></article></div>
    <div className="period-toolbar"><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="ALL">Tüm öncelikler</option><option value="HIGH">Yüksek</option><option value="MEDIUM">Orta</option><option value="LOW">Düşük</option></select><button type="button" onClick={() => void load()}>Yenile</button></div>
    <div className="cards">{shown.length ? shown.map((alert, index) => <article key={`${alert.code}-${index}`}><p><strong>{labels[alert.severity]} öncelik</strong> · {alert.code}</p><h2>{alert.title}</h2><p>{alert.detail}</p></article>) : <article><p>Bu filtreden açık finans uyarısı yok.</p></article>}</div>
  </section></main>;
}
