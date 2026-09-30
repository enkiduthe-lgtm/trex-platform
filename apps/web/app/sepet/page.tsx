import Link from 'next/link';
import { CartContents } from './cart-contents';
export default function Cart(){return <main className="products"><nav><Link href="/"><strong>TREX <span>TEA</span></strong></Link><Link href="/urunler">Ürünlere dön</Link></nav><p className="eyebrow">SEPET</p><h1>Sepetin hazır.</h1><CartContents/></main>}
