// Validate the legacy per-recipient view independently of the pooled management commission screen.
export function validateLegacyCommissionData<T>(value: unknown): T {
  const fail = (): never => { throw new Error('Prim kayıtları doğrulanamadı. Yenileyerek tekrar deneyin.'); };
  const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(); return value as Record<string, unknown>; };
  const text = (value: unknown) => { if (typeof value !== 'string') fail(); };
  const id = (value: unknown) => { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(); };
  const currency = (value: unknown) => { if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) fail(); };
  const money = (value: unknown) => { if (typeof value !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER / 100) fail(); };
  const data = object(value);
  if (typeof data.canManage !== 'boolean') fail();
  for (const name of ['rules', 'entries', 'staff', 'products', 'accounts']) {
    const rows = data[name]; if (!Array.isArray(rows)) return fail();
    const seen = new Set<string>();
    rows.forEach(value => {
      const row = object(value); id(row.id); if (seen.has(row.id as string)) fail(); seen.add(row.id as string);
      if (name === 'rules') {
        for (const key of ['product_name', 'sku', 'recipient_kind']) text(row[key]);
        if (row.recipient_email !== null) text(row.recipient_email);
        if (typeof row.is_active !== 'boolean') fail(); money(row.amount_per_unit); currency(row.currency);
      } else if (name === 'entries') {
        for (const key of ['order_number', 'product_name', 'recipient_kind', 'status', 'entry_kind']) text(row[key]);
        if (row.recipient_email !== null) text(row.recipient_email);
        money(row.amount); currency(row.currency);
        if (typeof row.quantity !== 'number' || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) fail();
      } else if (name === 'staff') { text(row.email); text(row.role); }
      else { text(row.name); if (name === 'products') text(row.sku); else currency(row.currency); }
    });
  }
  return data as T;
}
