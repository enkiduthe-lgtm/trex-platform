import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/odeme', '/sepet', '/hesabim', '/api/'] }, sitemap: 'https://www.trextea.com.tr/sitemap.xml' };
}
