'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AdminNav } from '../../components/admin-nav';
import { api } from '../../lib/api';
import styles from './marketplace-view.module.css';

type Product = { id: string; name: string; sku: string; barcode: string | null; status: string };
type Order = { id: string; order_number: string; marketplace_name: string | null; status: string; total_amount: string };

const views = {
  eslestirmeler: { title: 'Ürün eşleştirmeleri', eyebrow: 'PAZARYERİ SENKRONİZASYONU', description: 'Trex ürünlerinizi kanal kataloglarındaki karşılıklarıyla buradan kontrol edin.', action: 'Eşleştirme oluştur' },
  gonderimler: { title: 'Ürün gönderimleri', eyebrow: 'PAZARYERİ SENKRONİZASYONU', description: 'Yayınlanacak ürünler, fiyatlar ve stok bilgileri gönderim kuyruğunda görünür.', action: 'Gönderim kuyruğu oluştur' },
  'fiyat-rekabeti': { title: 'Fiyat rekabeti analizi', eyebrow: 'PAZARYERİ ANALİZİ', description: 'Ürün fiyatlarınızı kanal satışlarıyla kıyaslamak için çalışma listenizi yönetin.', action: 'İzlemeye al' },
} as const;

function channel(product: Product) { return product.barcode ? 'Hazır eşleştirme için barkod mevcut' : 'Barkod bekleniyor'; }

export default function MarketplaceView() {
  const params = useParams<{ view: string }>();
  const view = views[params.view as keyof typeof views];
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void Promise.all([api<Product[]>('/admin/products'), api<Order[]>('/admin/orders?channel=MARKETPLACE')])
      .then(([loadedProducts, loadedOrders]) => { setProducts(loadedProducts); setOrders(loadedOrders); })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Pazaryeri verileri yüklenemedi.'));
  }, []);

  const shown = useMemo(() => products.filter((product) => [product.name, product.sku, product.barcode].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))), [products, query]);
  const marketplaceOrders = orders.filter((order) => order.marketplace_name);
  const selectAll = () => setSelected(selected.length === shown.length ? [] : shown.map((product) => product.id));
  const perform = () => {
    if (!selected.length) { setMessage('Önce işlem yapılacak ürünleri seçin.'); return; }
    setMessage(`${selected.length} ürün işlem listesine alındı. Kanal bağlantısı etkinleştirildiğinde bu liste güvenli şekilde gönderime hazır olacaktır.`);
  };

  if (!view) return <main><AdminNav /><section><h1>Sayfa bulunamadı</h1></section></main>;
  return <main><AdminNav /><section className={styles.page}>
    <nav className={styles.subnav} aria-label="Pazaryeri alt menüsü"><Link href="/pazaryeri">Pazaryeri bağlantıları</Link><Link className={params.view === 'eslestirmeler' ? styles.current : ''} href="/pazaryeri/eslestirmeler">Ürün eşleştirmeleri</Link><Link className={params.view === 'gonderimler' ? styles.current : ''} href="/pazaryeri/gonderimler">Ürün gönderimleri</Link><Link className={params.view === 'fiyat-rekabeti' ? styles.current : ''} href="/pazaryeri/fiyat-rekabeti">Fiyat rekabeti</Link></nav>
    <div className={styles.heading}><div><p>{view.eyebrow}</p><h1>{view.title}</h1><span>{view.description}</span></div><button type="button" onClick={perform}>＋ {view.action}</button></div>
    {message && <p className={styles.notice} role="status">{message}</p>}
    <div className={styles.metrics}><article><small>Aktif ürün</small><b>{products.filter((product) => product.status === 'ACTIVE').length}</b></article><article><small>Barkodlu ürün</small><b>{products.filter((product) => product.barcode).length}</b></article><article><small>Pazaryeri siparişi</small><b>{marketplaceOrders.length}</b></article><article><small>İşlem listesi</small><b>{selected.length}</b></article></div>
    <div className={styles.toolbar}><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün adı, SKU veya barkod ara" /></label><button className={styles.secondary} type="button" onClick={selectAll}>{selected.length === shown.length && shown.length ? 'Seçimi kaldır' : 'Tümünü seç'}</button><button type="button" onClick={perform}>Seçilenleri işle</button></div>
    <div className={styles.tableWrap}><table><thead><tr><th><input aria-label="Tüm ürünleri seç" type="checkbox" checked={shown.length > 0 && selected.length === shown.length} onChange={selectAll} /></th><th>Ürün bilgileri</th><th>Kanal hazırlığı</th><th>{params.view === 'fiyat-rekabeti' ? 'Fiyat takibi' : params.view === 'gonderimler' ? 'Gönderim durumu' : 'Eşleştirme durumu'}</th><th>İşlem</th></tr></thead><tbody>{shown.map((product) => <tr key={product.id}><td><input aria-label={`${product.name} seç`} type="checkbox" checked={selected.includes(product.id)} onChange={() => setSelected((items) => items.includes(product.id) ? items.filter((item) => item !== product.id) : [...items, product.id])} /></td><td><b>{product.name}</b><small>SKU: {product.sku} · Barkod: {product.barcode ?? '—'}</small></td><td><span className={product.barcode ? styles.ok : styles.waiting}>{channel(product)}</span></td><td>{params.view === 'fiyat-rekabeti' ? <small>Fiyat izleme için seçin</small> : params.view === 'gonderimler' ? <small>Gönderim listesine alınmadı</small> : <small>{product.barcode ? 'Kanal kaydı bekleniyor' : 'Barkod girilmesi gerekli'}</small>}</td><td><button className={styles.rowButton} type="button" onClick={() => setSelected((items) => items.includes(product.id) ? items.filter((item) => item !== product.id) : [...items, product.id])}>{selected.includes(product.id) ? 'Çıkar' : 'Seç'}</button></td></tr>)}</tbody></table>{shown.length === 0 && <p className={styles.empty}>Gösterilecek ürün bulunamadı.</p>}</div>
    <p className={styles.caption}>Bu ekran Trex ürün ve sipariş verilerini kullanır. Gerçek kanal gönderimi, ilgili pazar yerinin bağlantı bilgileri tanımlandığında açılır.</p>
  </section></main>;
}
