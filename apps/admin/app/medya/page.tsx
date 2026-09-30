import Link from 'next/link';
import { AssetUploader } from './asset-uploader';
const slots=[
['Ana sayfa büyük banner','1920 × 720 px','WebP veya JPG · en fazla 500 KB','Ürünü ve yazıyı güvenli orta alanda tut.'],
['Mobil ana sayfa banner','1080 × 1350 px','WebP veya JPG · en fazla 400 KB','Yazılar görselin içine gömülmemeli.'],
['Ürün ana görseli','1600 × 1600 px','WebP veya JPG · en fazla 350 KB','Kare, açık arka plan, ürün ortada.'],
['Ürün ek görseli','1200 × 1200 px','WebP veya JPG · en fazla 300 KB','Aynı ışık ve arka plan stilini koru.'],
['Kategori görseli','1200 × 800 px','WebP veya JPG · en fazla 350 KB','Yatay, ürün veya çay ritüeli odaklı.'],
['Blog kapak görseli','1600 × 900 px','WebP veya JPG · en fazla 400 KB','Yatay 16:9 oranını koru.'],
['Site logosu','512 × 512 px','SVG tercih edilir; PNG yedek','Şeffaf arka plan kullan.'],
['Favicon','64 × 64 px','SVG veya PNG · en fazla 50 KB','Sade, küçük boyutta okunabilir olmalı.'],
['Sosyal paylaşım görseli','1200 × 630 px','JPG veya PNG · en fazla 500 KB','Başlık için sol/orta bölgede boş alan bırak.'],
];
export default function Media(){return <main><aside><b>TREX<br/>YÖNETİM</b><Link href="/">Genel bakış</Link><Link href="/urunler">Ürünler</Link><Link href="/siparisler">Siparişler</Link><Link href="/stok">Stok</Link><Link href="/bayiler">Bayiler</Link><Link href="/finans">Finans</Link><Link href="/medya">Medya rehberi</Link></aside><section><p>GÖRSEL YÜKLEME REHBERİ</p><h1>Hangi görsel nereye?</h1><p>Görsel yükleme alanı açıldığında bu ölçüler otomatik olarak yanında görünecek.</p><AssetUploader/><div className="cards">{slots.map(([name,size,file,note])=><article key={name}><h2>{name}</h2><strong>{size}</strong><p>{file}</p><p>{note}</p></article>)}</div></section></main>}
