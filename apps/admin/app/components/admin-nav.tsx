'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '../lib/api';

const groups = [
  { label: 'OPERASYON', items: [['Genel bakış','/'],['Siparişler','/siparisler'],['Stok ve depo','/stok'],['İadeler','/iadeler']] },
  { label: 'KATALOG', items: [['Ürünler','/urunler'],['Kârlılık','/karlilik'],['Kampanyalar','/kampanyalar'],['Medya','/medya'],['İçerikler ve SEO','/icerikler']] },
  { label: 'TİCARİ', items: [['Müşteriler','/musteriler'],['Bayiler','/bayiler'],['Toptan','/toptan'],['Pazar yeri','/pazaryeri']] },
  { label: 'FİNANS', items: [['Finans özeti','/finans'],['Masraflar','/finans/masraflar'],['Havale onayı','/finans/havaleler']] },
  { label: 'SİSTEM', items: [['Bildirimler','/bildirimler'],['Personel','/personel']] },
] as const;

export function AdminNav() {
  const router = useRouter(); const pathname = usePathname();
  return <aside className="admin-nav"><Link className="brand" href="/"><span>TREX</span><strong>YÖNETİM</strong><small>OPERASYON MERKEZİ</small></Link><nav>{groups.map(group=><div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map(([label,href])=><Link className={pathname===href?'active':''} key={href} href={href}>{label}</Link>)}</div>)}</nav><div className="nav-footer"><a href="https://www.trextea.com.tr" target="_blank" rel="noreferrer">Mağazayı görüntüle ↗</a><button className="nav-button" onClick={() => { clearToken(); router.push('/giris'); }}>Çıkış yap</button></div></aside>;
}
