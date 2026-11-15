const directResources: Record<string, string[]> = {
  '/iadeler': ['RETURNS'],
  '/siparisler/havaleler': ['FINANCE'],
  '/cari': ['CURRENT'],
  '/destek': ['SUPPORT'],
  '/bildirimler': ['NOTIFICATIONS'],
  '/kargo': ['SHIPPING'],
  '/karlilik': ['REPORTS'],
  '/bayiler/satis-raporu': ['REPORTS', 'DEALERS'],
};

export function managerNavEntryAllowed(href: string, defaultResource: string | undefined, grants: readonly string[]) {
  const path = href.split(/[?#]/)[0];
  if (['/raporlar/ozel', '/siparisler/sil', '/personel', '/islem-kayitlari'].includes(path) || path.startsWith('/yonetim/')) return false;
  if (path === '/siparisler/yeni') return grants.includes('ORDERS.VIEW') && grants.includes('ORDERS.CREATE');
  const resources = directResources[path] ?? (defaultResource ? [defaultResource] : []);
  return resources.length > 0 && resources.every(resource => grants.includes(resource + '.VIEW'));
}
