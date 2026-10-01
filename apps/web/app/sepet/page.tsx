import Link from 'next/link';
import { CartContents } from './cart-contents';
import { CartLink } from '../cart-link';
export default function Cart(){return <main className="products"><nav><Link href="/"><strong>TREX <span>TEA</span></strong></Link><div><Link href="/urunler">Ürünlere dön</Link><CartLink/></div></nav><p className="eyebrow">SEPET</p><h1>Sepetin hazır.</h1><CartContents/></main>}
