'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';
import { downloadXlsx } from '../lib/xlsx';
import styles from './reports.module.css';

type Row = { status?: string; sales_channel?: string; label?: string; count: number; amount: string };
type Report = { days: number; totals: { order_count: number; revenue: string; average_order: string }; financial: { income: string; expense: string; net: string }; statuses: Row[]; channels: Row[]; daily: Row[]; topProducts: Row[] };
type Operations = { returns_open: number; returns_refunded: number; shipments_active: number; shipments_failed: number; support_overdue: number };

const money = (value: string) => Number(value || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
const channel = (value: string) => ({ PUBLIC_WEB: 'Site satışı', ADMIN_ORDER: 'Yönetici siparişi', RETAIL: 'Perakende satış', DEALER_PORTAL: 'Bayi satışı', WHOLESALE: 'Toptan satış', INSTAGRAM: 'Instagram satışı', MARKETPLACE: 'Pazaryeri satışı' }[value] ?? value);
const reportCatalog = [
  ['Günlük Satış Özeti', 'Günlük olarak gerçekleşen sipariş sayıları, satış tutarları ve iade oranları.', 'Satışlar'],
  ['Platform Satış Performansı', 'Siparişlerin pazaryerlerine göre dağılımı, satış tutarları ve iade oranları.', 'Satışlar'],
  ['Stok Durum Raporu', 'Genel stok seviyelerinin ürün bazında listesi.', 'Ürünler'],
  ['Ürün Satış Raporu', 'Ürünlerin satış miktarı, iade miktarı ve tutarları.', 'Ürün Bazlı Satışlar'],
  ['Günlük Yeni Üye Kaydı', 'Sisteme kayıt olan üyelerin günlük sayıları.', 'Müşteriler'],
  ['Günlük Ziyaretçi Özeti', 'Günlük ziyaretçi sayıları, davranışları ve dönüşüm oranları.', 'Ziyaretçiler'],
  ['Haftalık Satışlar', 'Haftalara göre sipariş sayıları, satış tutarları ve iade oranları.', 'Satışlar'],
  ['Aylık Satışlar', 'Aylık bazda sipariş sayıları, satış tutarları ve iade oranları.', 'Satışlar'],
  ['Ödeme Yöntemi Satış Raporu', 'Siparişlerin ödeme yöntemlerine göre dağılımı.', 'Satışlar'],
  ['Siparişlerin Kargo Firmalarına Göre Dağılımı', 'Siparişlerin kargo firmalarına göre dağılımı ve satış tutarları.', 'Satışlar'],
  ['Kritik Stok Seviyesindeki Ürünler', 'Kritik stok seviyesine ulaşan ürünlerin listesi.', 'Ürünler'],
  ['Üye Sipariş Raporu', 'Üyelerin sipariş sayıları ve satış tutarları.', 'Müşteriler'],
];

export default function Reports() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Report | null>(null);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [message, setMessage] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  useEffect(() => {
    setMessage('');
    void Promise.all([api<Report>(`/admin/orders/report-summary?days=${days}`), api<Operations>(`/admin/orders/report-operations?days=${days}`)])
      .then(([report, operation]) => { setData(report); setOperations(operation); })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Rapor yüklenemedi'));
  }, [days]);
  const max = useMemo(() => Math.max(...(data?.daily.map((row) => Number(row.amount)) ?? [1]), 1), [data]);
  function exportReport() {
    if (!data) return;
    const rows = [['Dönem özeti', 'Tutar'], ['Sipariş cirosu', data.totals.revenue], ['Para girişi', data.financial.income], ['Para çıkışı', data.financial.expense], ['Net nakit hareketi', data.financial.net], [], ['Tarih', 'Sipariş', 'Ciro'], ...data.daily.map((row) => [row.label ?? '', String(row.count), row.amount]), [], ['Satış kanalı', 'Sipariş', 'Ciro'], ...data.channels.map((row) => [channel(row.sales_channel ?? ''), String(row.count), row.amount]), [], ['Ürün', 'Adet', 'Ciro'], ...data.topProducts.map((row) => [row.label ?? '', String(row.count), row.amount])];
    downloadXlsx(`trex-yonetim-raporu-${days}-gun.xlsx`, 'Yönetim Raporu', rows);
  }
  const shownCatalog = reportCatalog.filter(([name, description, category]) => `${name} ${description} ${category}`.toLocaleLowerCase('tr-TR').includes(reportSearch.toLocaleLowerCase('tr-TR')));
  const selectedMeta = reportCatalog.find(([name]) => name === selectedReport);
  function openReport(name: string) {
    setSelectedReport(name);
    setMessage(`${name} açıldı. Seçili dönem özeti bu sayfada görüntüleniyor.`);
  }
  return <main><AdminNav /><section className={styles.page}>
    <p>RAPORLAR / SATIŞ VE FİNANS ÖZETİ</p><h1>Yönetim raporları</h1><p>Satış, para hareketi ve operasyon kayıtlarından oluşturulan dönem özeti.</p>
    <div className="period-toolbar"><div>{[7, 30, 90, 365].map((value) => <button className={days === value ? 'selected' : ''} key={value} onClick={() => setDays(value)}>Son {value} gün</button>)}</div><button type="button" disabled={!data} onClick={exportReport}>Excel&apos;e Aktar</button></div>{message && <p role="alert">{message}</p>}
    <section className={styles.catalog} aria-labelledby="catalog-title"><div className={styles.catalogHeader}><div><p>RAPOR KATALOĞU</p><h2 id="catalog-title">Raporlar <small>({reportCatalog.length})</small></h2></div><label><span>⌕</span><input value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="Rapor ara..." /></label></div><div className={styles.tableWrap}><table><thead><tr><th>Rapor adı</th><th>Kategori</th><th>Oluşturma</th><th>İşlem</th></tr></thead><tbody>{shownCatalog.map(([name, description, category])=><tr key={name} className={selectedReport===name?styles.selectedRow:''}><td><b>{name}</b><small>{description}</small></td><td><span>{category}</span></td><td>Canlı veri</td><td><button type="button" onClick={()=>openReport(name)}>Raporu aç</button></td></tr>)}</tbody></table>{!shownCatalog.length&&<p className={styles.empty}>Aramanıza uygun rapor bulunamadı.</p>}</div>{selectedMeta && <section className={styles.selectedReport}><div><p>SEÇİLİ RAPOR</p><h2>{selectedMeta[0]}</h2><span>{selectedMeta[1]}</span></div><div className={styles.selectedNumbers}><article><small>Seçili dönem</small><b>{days} gün</b></article><article><small>Sipariş</small><b>{data?.totals.order_count ?? '—'}</b></article><article><small>Satış cirosu</small><b>{data ? money(data.totals.revenue) : '—'}</b></article></div><button type="button" onClick={exportReport} disabled={!data}>Bu Raporu Excel&apos;e Aktar</button></section>}</section>
    <div className="cards"><article><p>SİPARİŞ</p><h2>{data?.totals.order_count ?? '—'}</h2><p>Seçilen dönem</p></article><article><p>SATIŞ CİROSU</p><h2>{data ? money(data.totals.revenue) : '—'}</h2><p>İptaller hariç</p></article><article><p>ORTALAMA SEPET</p><h2>{data ? money(data.totals.average_order) : '—'}</h2><p>Sipariş başına</p></article><article><p>PARA GİRİŞİ</p><h2>{data ? money(data.financial.income) : '—'}</h2><Link href="/finans">Finansı aç →</Link></article><article><p>PARA ÇIKIŞI</p><h2>{data ? money(data.financial.expense) : '—'}</h2><Link href="/finans">Masrafları aç →</Link></article><article><p>NET HAREKET</p><h2>{data ? money(data.financial.net) : '—'}</h2><p>Giriş − çıkış</p></article></div>
    <h2>Operasyon yükü</h2><div className="cards"><article><p>AÇIK İADE</p><h2>{operations?.returns_open ?? '—'}</h2><Link href="/iadeler">İadeleri aç →</Link></article><article><p>TAŞIMADA</p><h2>{operations?.shipments_active ?? '—'}</h2><Link href="/kargo">Kargoyu aç →</Link></article><article><p>SORUNLU KARGO</p><h2>{operations?.shipments_failed ?? '—'}</h2><Link href="/kargo">Gönderileri aç →</Link></article><article><p>GECİKEN DESTEK</p><h2>{operations?.support_overdue ?? '—'}</h2><Link href="/destek?overdue=true">Destek talepleri →</Link></article></div>
    <div className="form-card"><h2>Günlük satış cirosu</h2><div className="chart">{data?.daily.map((row) => <i key={row.label} style={{ height: `${Math.max(5, Math.round(Number(row.amount) / max * 100))}%` }} title={`${row.label}: ${money(row.amount)}`} />)}</div><div className="chart-labels">{data?.daily.map((row) => <span key={row.label}>{row.label}</span>)}</div></div>
    <div className="cards"><article><h2>Sipariş durumları</h2>{data?.statuses.map((row) => <p key={row.status}><b>{row.status}</b> · {row.count} sipariş · {money(row.amount)}</p>)}</article><article><h2>Satış kanalları</h2>{data?.channels.map((row) => <p key={row.sales_channel}><b>{channel(row.sales_channel ?? '')}</b> · {row.count} sipariş · {money(row.amount)}</p>)}</article><article><h2>En çok satan ürünler</h2>{data?.topProducts.map((row) => <p key={row.label}><b>{row.label}</b> · {row.count} adet · {money(row.amount)}</p>)}</article></div>
  </section></main>;
}
