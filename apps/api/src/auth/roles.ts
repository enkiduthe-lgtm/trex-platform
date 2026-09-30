export const Roles = { SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN', WAREHOUSE: 'WAREHOUSE', FINANCE: 'FINANCE', DEALER: 'DEALER', CUSTOMER: 'CUSTOMER' } as const;
export type Role = (typeof Roles)[keyof typeof Roles];
