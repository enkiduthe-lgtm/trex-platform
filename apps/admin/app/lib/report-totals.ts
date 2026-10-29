/** Sum decimal money exactly, keeping each currency separate. */
export function multiplyMoney(amount: string, quantity: number) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Geçersiz Tutar Veya Adet');
  const [whole, fraction = ''] = amount.split('.');
  const cents = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * BigInt(quantity);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function currencyTotals(rows: { currency: string; amount: string }[]) {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const currency = row.currency.trim();
    if (!currency || !/^-?\d+(?:\.\d{1,2})?$/.test(row.amount)) throw new Error('Geçersiz Para Tutarı');
    const negative = row.amount.startsWith('-');
    const [whole, fraction = ''] = row.amount.replace(/^-/, '').split('.');
    const cents = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
    totals.set(currency, (totals.get(currency) ?? 0n) + cents);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, cents]) => {
    const absolute = cents < 0n ? -cents : cents;
    return { currency, amount: `${cents < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}` };
  });
}
