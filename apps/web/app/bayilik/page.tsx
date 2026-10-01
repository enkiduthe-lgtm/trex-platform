import Link from 'next/link';
import { ApplicationForm } from './application-form';
export default function DealerApplication(){return <main><nav><strong>TREX <span>TEA</span></strong><div><Link href="/">Ana sayfa</Link><Link href="/urunler">Ürünler</Link></div></nav><section className="story"><p className="eyebrow">TREX BAYİLİK</p><h1>Birlikte büyüyelim.</h1><p>Başvurunuz alındı, inceleniyor, belge bekleniyor, onaylandı veya reddedildi olarak güvenle takip edilir.</p><ApplicationForm/></section><footer>© {new Date().getFullYear()} Trex Tea</footer></main>}
