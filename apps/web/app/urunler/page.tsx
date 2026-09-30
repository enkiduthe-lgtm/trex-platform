import Link from 'next/link';
import { getStorefrontProducts } from '../../lib/products';

export default async function Products() {
  const products = await getStorefrontProducts();
  return <main className="products"><nav><Link href="/"><strong>TREX <span>TEA</span></strong></Link><Link href="/">Ana sayfa</Link></nav><p className="eyebrow">TÜM ÜRÜNLER</p><h1>Çay seçkisi</h1><div className="grid">{products.map((product) => <article key={product.slug}><div className={`pack ${product.tone}`}>TREX<br/><small>TEA</small></div><h2>{product.name}</h2><p>{product.description}</p><b>{product.price}</b><Link className="cta" href={`/urunler/${product.slug}`}>İncele</Link></article>)}</div></main>;
}
