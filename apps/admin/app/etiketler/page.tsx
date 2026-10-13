'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../components/admin-nav';
import { api } from '../lib/api';

type Product = { id: string; name: string; sku: string; barcode: string | null; slug: string; status: string };

export default function LabelsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [copies, setCopies] = useState('1');
  const [message, setMessage] = useState('');
  useEffect(() => { void api<Product[]>('/admin/products').then(setProducts).catch(error => setMessage(error instanceof Error ? error.message : 'Ürünler yüklenemedi.')); }, []);
  const selected = useMemo(() => products.find(product => product.id === selectedId) ?? null, [products, selectedId]);
  const quantity = Math.min(100, Math.max(1, Number(copies) || 1));
  function print() { if (!selected) { setMessage('Önce bir ürün seçin.'); return; } window.print(); }
  return <main><AdminNav /><section>
    <style>{`@media print { .admin-header, .no-print { display:none !important; } main, section { padding:0 !important; } .label-sheet { display:grid !important; grid-template-columns:repeat(2, 85mm); gap:4mm; } .product-label { break-inside:avoid; border:1px solid #111 !important; } }`}</style>
    <div className="no-print"><p>ÜRÜNLER / BARKOD VE ETİKET</p><h1>Ürün etiketi yazdır</h1><p>Etiket üzerinde ürün adı, SKU ve ürün barkodu yer alır. Yazdırmadan önce etiket yazıcısı veya A4 kâğıt ayarınızı seçin.</p>{message && <p role="status">{message}</p>}<div className="form-card"><label>Ürün<select value={selectedId} onChange={event => setSelectedId(event.target.value)}><option value="">Ürün seçin</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label><label>Etiket adedi<input type="number" min="1" max="100" value={copies} onChange={event => setCopies(event.target.value)} /></label><button type="button" disabled={!selected} onClick={print}>Etiketleri yazdır</button></div></div>
    {selected ? <div className="label-sheet" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 24 }}>{Array.from({ length: quantity }, (_, index) => <article className="product-label" key={index} style={{ border: '1px solid #172033', borderRadius: 10, padding: 20, minHeight: 155, background: '#fff' }}><p style={{ margin: 0, fontSize: 12, letterSpacing: 1 }}>TREX TEA</p><h2 style={{ margin: '10px 0 4px' }}>{selected.name}</h2><p style={{ margin: '0 0 16px' }}>SKU: {selected.sku}</p><div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 22, letterSpacing: 3, overflowWrap: 'anywhere' }}>{selected.barcode ?? selected.sku}</div><small>Barkod: {selected.barcode ?? 'Barkod tanımlı değil — SKU kullanıldı'}</small></article>)}</div> : <div className="cards"><article><p>Ön izleme için bir ürün seçin.</p></article></div>}
  </section></main>;
}
