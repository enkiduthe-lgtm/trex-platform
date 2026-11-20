type Profile = { configured: boolean; grants: string[] | null };

export function dashboardAccess(role: string, profile?: Profile) {
  const view = (resource: string, legacyRoles: string[]) => {
    if (role === 'SUPER_ADMIN') return true;
    if (role === 'ADMIN' && profile?.configured) return !!profile.grants?.includes(resource + '.VIEW');
    return legacyRoles.includes(role);
  };
  return {
    orders: view('ORDERS', ['ADMIN', 'FINANCE', 'WAREHOUSE']),
    stock: view('STOCK', ['ADMIN', 'WAREHOUSE']),
    support: view('SUPPORT', ['ADMIN']),
    shipping: view('SHIPPING', ['ADMIN', 'WAREHOUSE']),
    reports: view('REPORTS', []),
  };
}
