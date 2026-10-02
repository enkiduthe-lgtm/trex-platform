'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearToken } from '../lib/api';
export function AdminNav() { const router = useRouter(); return <aside><b>TREX<br/>YÖNETİM</b><Link href="/">Genel bakış</Link><Link href="/urunler">Ürünler</Link><Link href="/karlilik">Kârlılık</Link><Link href="/siparisler">Siparişler</Link><Link href="/toptan">Toptan</Link><Link href="/pazaryeri">Pazar yeri</Link><Link href="/iadeler">İadeler</Link><Link href="/stok">Stok</Link><Link href="/bayiler">Bayiler</Link><Link href="/finans">Finans</Link><Link href="/finans/masraflar">Masraflar</Link><Link href="/finans/havaleler">Havale onayı</Link><Link href="/musteriler">Müşteriler</Link><Link href="/kampanyalar">Kampanyalar</Link><Link href="/bildirimler">Bildirimler</Link><Link href="/medya">Medya</Link><Link href="/personel">Personel</Link><button className="nav-button" onClick={() => { clearToken(); router.push('/giris'); }}>Çıkış yap</button></aside>; }
