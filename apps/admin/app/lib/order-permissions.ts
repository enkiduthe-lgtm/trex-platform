type AccessProfile = { configured: boolean; grants: string[] | null };

export function orderPermissions(role: string, profile?: AccessProfile) {
  const allowed = (resource: string, action: string, roles: string[]) => {
    if (role === 'SUPER_ADMIN') return true;
    if (role === 'ADMIN' && profile?.configured) {
      return !!profile.grants?.includes(resource + '.VIEW') && !!profile.grants?.includes(resource + '.' + action);
    }
    return roles.includes(role);
  };
  return {
    create: allowed('ORDERS', 'CREATE', ['ADMIN']),
    edit: allowed('ORDERS', 'EDIT', ['ADMIN']),
    prepare: allowed('STOCK', 'EDIT', ['ADMIN', 'WAREHOUSE']),
    ship: allowed('SHIPPING', 'CREATE', ['ADMIN', 'WAREHOUSE']),
    verify: allowed('SHIPPING', 'CREATE', ['ADMIN', 'WAREHOUSE']),
    transfers: allowed('FINANCE', 'VIEW', ['ADMIN', 'FINANCE']),
    createTransfer: allowed('FINANCE', 'CREATE', ['ADMIN', 'FINANCE']),
  };
}
