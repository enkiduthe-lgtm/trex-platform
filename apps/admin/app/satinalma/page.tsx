'use client';

import Link from 'next/link';
import { AdminNav } from '../components/admin-nav';

export default function PurchasePage() {
  return <main><AdminNav /><section className="form-card"><p>STOK VE ENVANTER</p><h1>Ürün Girişleri Stok Ekranından Yapılır</h1><p>Ayrı satın alma süreci kaldırıldı. Geçmiş satın alma, finans ve stok kayıtları korunur.</p><Link className="button" href="/stok">Stok Ve Envantere Git</Link></section></main>;
}
