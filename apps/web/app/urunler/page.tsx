import Link from 'next/link';
import { getStorefrontProducts } from '../../lib/products';
import { CartLink } from '../cart-link';

export default async function Products() {
  const products = await getStorefrontProducts();
  return <main className="products"><nav><Link href="/"><strong>TREX <span>TEA</span></strong></Link><div><Link href="/">Ana sayfa</Link><CartLink/></div></nav><p className="eyebrow">TÜM ÜRÜNLER</p><h1>Çay seçkisi</h1>{products.length ? <div className="grid">{products.map((product) => <article key={product.slug}><div className={`pack ${product.tone}`}>TREX<br/><small>TEA</small></div><h2>{product.name}</h2><p>{product.description}</p><b>{product.price}</b><Link className="cta" href={`/urunler/${product.slug}`}>İncele</Link></article>)}</div> : <p>Henüz yayında ürün yok. Yönetim panelinde ürün durumunu “Yayında” yapıp satış fiyatı ekleyin.</p>}</main>;
}
