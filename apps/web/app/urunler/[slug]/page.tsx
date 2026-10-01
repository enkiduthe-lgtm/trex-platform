import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStorefrontProduct } from '../../../lib/products';
import { AddToCartButton } from './add-to-cart-button';
import { CartLink } from '../../cart-link';

export default async function Product({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getStorefrontProduct(slug);
  if (!product) notFound();
  return <main className="products"><nav><Link href="/"><strong>TREX <span>TEA</span></strong></Link><div><Link href="/urunler">Ürünlere dön</Link><CartLink/></div></nav><div className={`pack ${product.tone}`} style={{ height: 380 }}>TREX<br/><small>TEA</small></div><p className="eyebrow">TREX SEÇKİSİ</p><h1>{product.name}</h1><p>{product.description}</p><b>{product.price}</b><AddToCartButton product={product}/></main>;
}
