import type { MetadataRoute } from 'next';
import { getStorefrontProducts } from '../lib/products';

const site = 'https://www.trextea.com.tr';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getStorefrontProducts();
  return [
    { url: site, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${site}/urunler`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${site}/bayilik`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${site}/yasal`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    ...products.map(product => ({ url: `${site}/urunler/${encodeURIComponent(product.slug)}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
