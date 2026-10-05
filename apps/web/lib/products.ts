import { catalog } from './catalog';

export type StorefrontProduct = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  price: string;
  unitAmount?: number;
  tone: string;
};

type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sale_price: string | null;
};

const fallbackProducts: StorefrontProduct[] = catalog;

function asStorefrontProduct(product: ApiProduct, index: number): StorefrontProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description || 'Özenle hazırlanan Trex Tea seçkisi.',
    price: product.sale_price ? Number(product.sale_price).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' }) : 'Fiyat yakında',
    unitAmount: product.sale_price ? Number(product.sale_price) : undefined,
    tone: `pack-${(index % 3) + 1}`,
  };
}

async function requestProducts(): Promise<ApiProduct[] | null> {
  const apiUrl = process.env.TREX_API_URL?.replace(/\/$/, '');
  if (!apiUrl) return null;

  try {
    const response = await fetch(`${apiUrl}/v1/products`, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return Array.isArray(data) ? data as ApiProduct[] : null;
  } catch {
    return null;
  }
}

export async function getStorefrontProducts(): Promise<StorefrontProduct[]> {
  const products = await requestProducts();
  return products?.length ? products.map(asStorefrontProduct) : fallbackProducts;
}

export async function getStorefrontProduct(slug: string): Promise<StorefrontProduct | undefined> {
  const products = await getStorefrontProducts();
  return products.find((product) => product.slug === slug);
}
