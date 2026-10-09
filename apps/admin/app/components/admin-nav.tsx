'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { logout } from '../lib/api';

type Entry = { label: string; href?: string };
type Menu = { label: string; href?: string; icon: string; groups?: { title: string; entries: Entry[] }[] };
const menus: Menu[] = [
  { label: 'STOK / DEPO', href: '/stok', icon: '▦', groups: [{ title: 'Yönetim', entries: [{ label: 'Stok girişi', href: '/stok' }, { label: 'Stok silme', href: '/stok#stok-silme' }, { label: 'Depo silme', href: '/stok#depo-silme' }, { label: 'Ürün silme', href: '/urunler' }] }] },
  { label: 'SİPARİŞLER', href: '/siparisler', icon: '▤', groups: [{ title: 'Sipariş durumları', entries: [{ label: 'Tüm siparişler', href: '/siparisler' }, { label: 'İade talepleri', href: '/iadeler' }, { label: 'Ödeme hareketleri', href: '/finans' }] }, { title: 'Operasyon', entries: [{ label: 'Depo ve stok', href: '/stok' }, { label: 'Kargo işlemleri', href: '/kargo' }, { label: 'Sipariş etiketleri', href: '/kargo' }] }] },
  { label: 'ÜRÜNLER', href: '/urunler', icon: '◇', groups: [{ title: 'Katalog', entries: [{ label: 'Ürünler', href: '/urunler' }, { label: 'Kategoriler', href: '/katalog/categories' }, { label: 'Markalar', href: '/katalog/brands' }, { label: 'Etiketler', href: '/katalog/tags' }, { label: 'Nitelikler', href: '/katalog/attributes' }, { label: 'Stok birimleri', href: '/katalog/units' }] }, { title: 'Ürün işlemleri', entries: [{ label: 'Stok yönetimi', href: '/stok' }, { label: 'Ürün görselleri', href: '/medya' }, { label: 'Fiyat ve kârlılık', href: '/karlilik' }, { label: 'Toplu ürün güncelleme', href: '/urunler' }, { label: 'İçe / dışa aktarma', href: '/urunler' }] }] },
  { label: 'PAZARYERİ', href: '/pazaryeri', icon: '◫', groups: [{ title: 'Kanallar', entries: [{ label: 'Pazaryeri bağlantıları', href: '/pazaryeri' }, { label: 'Bayi satış kanalı', href: '/toptan' }] }, { title: 'Senkronizasyon', entries: [{ label: 'Ürün eşleştirmeleri', href: '/pazaryeri/eslestirmeler' }, { label: 'Ürün gönderimleri', href: '/pazaryeri/gonderimler' }, { label: 'Fiyat rekabeti analizi', href: '/pazaryeri/fiyat-rekabeti' }] }] },
  { label: 'KAMPANYALAR', href: '/kampanyalar', icon: '✦', groups: [{ title: 'Fiyatlandırma', entries: [{ label: 'Kampanya yönetimi', href: '/kampanyalar' }, { label: 'Bayi indirimleri', href: '/bayiler' }, { label: 'Hızlı indirimler', href: '/kampanyalar' }] }, { title: 'Pazarlama', entries: [{ label: 'Hediye çekleri', href: '/kampanyalar' }, { label: 'Satış kotaları', href: '/kampanyalar' }, { label: 'E-posta ve SMS bültenleri', href: '/bildirimler' }] }] },
  { label: 'MÜŞTERİLER', href: '/musteriler', icon: '♙', groups: [{ title: 'Müşteri yönetimi', entries: [{ label: 'Müşteriler', href: '/musteriler' }, { label: 'Bayiler', href: '/bayiler' }, { label: 'Cari ve bakiye', href: '/finans' }] }, { title: 'İletişim', entries: [{ label: 'Bildirim merkezi', href: '/bildirimler' }, { label: 'Müşteri talepleri', href: '/musteriler' }, { label: 'Müşteri grupları', href: '/musteriler' }] }] },
  { label: 'TASARIM', href: '/yonetim/tasarim', icon: '◈', groups: [{ title: 'Mağaza', entries: [{ label: 'Tasarım merkezi', href: '/yonetim/tasarim' }, { label: 'İçerikler', href: '/icerikler' }, { label: 'Medya merkezi', href: '/medya' }, { label: 'SEO optimizasyonu', href: '/yonetim/tasarim' }] }, { title: 'İçerik', entries: [{ label: 'Bannerlar ve görseller', href: '/medya' }, { label: 'Sayfalar', href: '/icerikler' }, { label: 'Yönlendirmeler', href: '/yonetim/tasarim' }] }] },
  { label: 'RAPORLAR', href: '/yonetim/raporlar', icon: '▥', groups: [{ title: 'Analiz', entries: [{ label: 'Rapor merkezi', href: '/yonetim/raporlar' }, { label: 'Kârlılık raporu', href: '/karlilik' }, { label: 'Satış performansı', href: '/yonetim/raporlar' }, { label: 'Stok raporları', href: '/stok' }] }] },
  { label: 'ARAÇLAR', href: '/yonetim/araclar', icon: '⚙', groups: [{ title: 'Entegrasyonlar', entries: [{ label: 'Araçlar merkezi', href: '/yonetim/araclar' }, { label: 'Ödeme yöntemleri', href: '/finans' }, { label: 'Kargo ve teslimat', href: '/stok' }, { label: 'Pazaryeri bağlantıları', href: '/pazaryeri' }] }, { title: 'Sistem', entries: [{ label: 'Bildirimler', href: '/bildirimler' }, { label: 'Muhasebe / ERP', href: '/yonetim/araclar' }, { label: 'Eklentiler', href: '/yonetim/araclar' }] }] },
  { label: 'AYARLAR', href: '/yonetim/ayarlar', icon: '⚿', groups: [{ title: 'Yönetim', entries: [{ label: 'Ayarlar merkezi', href: '/yonetim/ayarlar' }, { label: 'Personeller ve yetkiler', href: '/personel' }, { label: 'İşlem kayıtları', href: '/islem-kayitlari' }, { label: 'Bildirim ayarları', href: '/bildirimler' }, { label: 'Mağaza ayarları', href: '/yonetim/ayarlar' }] }, { title: 'Ticari', entries: [{ label: 'Vergiler', href: '/yonetim/ayarlar' }, { label: 'Para birimleri', href: '/yonetim/ayarlar' }, { label: 'Yazdırma etiketleri', href: '/yonetim/ayarlar' }] }] },
];
function active(pathname: string, menu: Menu) { return Boolean(menu.href && (pathname === menu.href || (menu.href !== '/' && pathname.startsWith(`${menu.href}/`)))) || Boolean(menu.groups?.some(g => g.entries.some(e => e.href === pathname))); }
export function AdminNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function signOut() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await logout(); router.replace('/giris'); router.refresh(); }
    catch { setError('Çıkış tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <header className="admin-header"><div className="header-main"><Link className="header-brand" href="/"><b>TREX</b><span>YÖNETİM</span></Link><label className="panel-search"><input aria-label="Panelde ara" placeholder="Panelde ara" /><span>⌕</span></label><div className="header-links"><a href="https://www.trextea.com.tr" target="_blank" rel="noreferrer">Siteyi görüntüle ↗</a><Link href="/bildirimler">● Bildirimler</Link><button disabled={busy} onClick={() => void signOut()}>{busy ? 'Çıkış yapılıyor…' : 'Çıkış'}</button></div></div>
    {error && <p role="alert">{error}</p>}
    <nav className="header-nav" aria-label="Yönetim menüsü"><Link className={pathname === '/' ? 'active' : ''} href="/"><i>⌂</i> ANA SAYFA</Link>{menus.map(menu => <div className={`nav-menu ${active(pathname, menu) ? 'active' : ''}`} key={menu.label}>{menu.href ? <Link href={menu.href}><i>{menu.icon}</i>{menu.label}<small>⌄</small></Link> : <button type="button"><i>{menu.icon}</i>{menu.label}<small>⌄</small></button>}<div className="nav-dropdown">{menu.groups?.map(group => <section key={group.title}><h3>{group.title}</h3>{group.entries.map(entry => entry.href ? <Link href={entry.href} key={entry.label}>{entry.label}</Link> : <span className="soon" key={entry.label}>{entry.label}<em>Yakında</em></span>)}</section>)}</div></div>)}</nav>
  </header>;
}
