'use client';
import { useId, useState } from 'react';
import type { ChartDatum } from '../lib/chart-data';
import styles from './metric-chart.module.css';

const palette = ['#7c3aed', '#0f9488', '#3b82f6', '#d97706', '#db457b', '#52647a'];
const categoryColors:Record<string,string>={'Teslim Edildi':'#0f9488','Hazırlanıyor':'#3b82f6','Kargoda':'#7c3aed','Ödeme Bekliyor':'#d97706','İptal Edildi':'#64748b','İade Edildi':'#db457b','Kesinleşti':'#0f9488','Bekliyor':'#d97706','Ödendi':'#3b82f6','İade / Kesinti':'#db457b'};
const ringColor=(row:ChartDatum,index:number)=>row.color??categoryColors[row.label]??palette[index%palette.length];
export function MetricChart({ title, description, data, currency, variant = 'bar', loading = false, unavailable = false }: {
  title: string; description?: string; data: ChartDatum[]; currency?: string; variant?: 'bar' | 'ring'; loading?: boolean; unavailable?: boolean;
}) {
  const id = useId();
  const [selection, setSelection] = useState<{index:number;signature:string}|null>(null);
  const rows = data.filter(item => Number.isFinite(item.value));
  const signature = JSON.stringify([currency,variant,rows.map(row=>[row.label,row.value])]);
  const active = selection?.signature === signature ? selection.index : null;
  const setActive = (index:number|null) => setSelection(index===null?null:{index,signature});
  const format = (value: number, compact = false) => new Intl.NumberFormat('tr-TR', currency
    ? { style: 'currency', currency, notation: compact && Math.abs(value)>=1000 ? 'compact' : 'standard', maximumFractionDigits: compact && Math.abs(value)>=1000 ? 1 : 2 }
    : { notation: compact && Math.abs(value)>=1000 ? 'compact' : 'standard', maximumFractionDigits: compact && Math.abs(value)>=1000 ? 1 : 0 }).format(value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const selected = active === null ? null : rows[active];
  const empty = !rows.some(row => row.value !== 0);
  const high = Math.max(0, ...rows.map(row => row.value));
  const low = Math.min(0, ...rows.map(row => row.value));
  const range = high - low || 1;
  const y = (value: number) => 24 + (high - value) / range * 164;
  const step = 602 / Math.max(rows.length, 1);
  const ticks = [...new Set([0,1,2,3,4].map(tick=>Number((high-range*tick/4).toFixed(currency?2:0))))];
  let ringOffset = 0;
  return <section className={styles.card} aria-labelledby={id}>
    <header className={styles.heading}><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div><span className={styles.badge}>{currency ?? 'Adet'}</span></header>
    <div className={styles.readout} aria-live="polite"><span>{loading?'Yükleniyor':unavailable?'Veri Alınamadı':selected?.label ?? 'Toplam'}</span><strong>{loading||unavailable?'—':format(selected?.value ?? total)}</strong></div>
    {loading||unavailable ? <div className={styles.empty} role="status">{loading?'Grafik Verileri Yükleniyor…':'Grafik Verileri Alınamadı. Sayfayı Yenileyerek Tekrar Deneyin.'}</div> : empty ? <div className={styles.empty}>Bu Dönemde Gösterilecek Grafik Değeri Yok.</div> : variant === 'ring' && low >= 0 ? <div className={styles.ringLayout}>
      <svg className={styles.ring} viewBox="0 0 200 200" role="img" aria-label={title}>
        <circle cx="100" cy="100" r="74" fill="none" stroke="#eeeaf3" strokeWidth="24" />
        {rows.map((row, index) => {
          const part = row.value / total * 100, offset = ringOffset; ringOffset += part;
          return <circle key={index} cx="100" cy="100" r="74" fill="none" stroke={ringColor(row,index)} strokeWidth={active === index ? 30 : 24} pathLength="100" strokeDasharray={`${part} ${100 - part}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" opacity={active === null || active === index ? 1 : .35}><title>{`${row.label}: ${format(row.value)}`}</title></circle>;
        })}
        <text x="100" y="97" textAnchor="middle" className={styles.ringTotal}>{format(total, true)}</text><text x="100" y="119" textAnchor="middle" className={styles.ringCaption}>Toplam</text>
      </svg>
      <div className={styles.legend}>{rows.map((row, index) => <button key={index} type="button" onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)} aria-pressed={active === index}><i style={{ background: ringColor(row,index) }} /><span>{row.label}</span><b>{format(row.value)}<small>%{(row.value / total * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</small></b></button>)}</div>
    </div> : <div className={styles.plot}>
      <svg viewBox="0 0 720 242" className={styles.bars} role="group" aria-label={title}>
        {ticks.map(value => <g key={value}><line x1="90" x2="692" y1={y(value)} y2={y(value)} stroke="#e9e5ee" strokeDasharray="4 5" /><text x="80" y={y(value) + 4} textAnchor="end" className={styles.axis}>{format(value, true)}</text></g>)}
        <line x1="90" x2="692" y1={y(0)} y2={y(0)} stroke="#c1b5cd" />
        {rows.map((row, index) => <g key={index} role="button" tabIndex={0} aria-label={`${row.label}: ${format(row.value)}`} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); setActive(index); } }}>
          <rect x={90 + index * step} y="16" width={step} height="196" fill="transparent" />
          <rect x={90 + index * step + step * .23} y={Math.min(y(0), y(row.value))} width={step * .54} height={Math.abs(y(row.value) - y(0))} rx="5" fill={row.color ?? (row.value<0?'#db457b':'#7c3aed')} opacity={active === null || active === index ? 1 : .35} />
          <text x={90 + index * step + step / 2} y="224" textAnchor="middle" className={styles.axis}>{row.label.length > 13 ? row.label.slice(0, 12) + '…' : row.label}</text>
          <title>{`${row.label}: ${format(row.value)}`}</title>
        </g>)}
      </svg>
    </div>}
    {!loading&&!unavailable&&<details className={styles.details}><summary>Grafik Verilerini Göster</summary><div><table><thead><tr><th>Dönem / Kategori</th><th>{currency ? `Tutar (${currency})` : 'Adet'}</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{row.label}</td><td>{format(row.value)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
