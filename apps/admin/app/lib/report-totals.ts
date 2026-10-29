/** Sum decimal money exactly, keeping each currency separate. */
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
