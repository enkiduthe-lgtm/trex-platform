import Link from 'next/link';
import { CouponBox } from './coupon-box';
export default function Cart(){return <main className="products"><nav><Link href="/"><strong>TREX <span>TEA</span></strong></Link><Link href="/urunler">Ürünlere dön</Link></nav><p className="eyebrow">SEPET</p><h1>Sepetin hazır.</h1><section className="story" style={{marginTop:'2rem'}}><h2>Henüz ürün yok.</h2><p>Çaylarını seçtiğinde burada miktar, teslimat ve ödeme özeti görünecek.</p><CouponBox/><Link className="cta" href="/urunler">Ürünlere git</Link></section></main>}
