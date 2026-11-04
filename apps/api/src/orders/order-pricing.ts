import { BadRequestException } from '@nestjs/common';

export const formatCents = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
export function cents(value: number | string): bigint {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new BadRequestException('Geçersiz Tutar');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function codFee(method: string, value?: number): bigint {
  if (!method.startsWith('COD_')) {
    if (value !== undefined && value !== 0) throw new BadRequestException('Hizmet Bedeli Yalnız Kapıda Ödemede Kullanılır');
    return 0n;
  }
  return cents(value ?? 75);
}

// Allocate indivisible package cents to real product units. No synthetic stock item
// or fee is introduced, and both the sale and the dealer floor remain exact.
export function allocatePack(base: bigint, sale: bigint, size: number, count: number) {
  if (![2, 3, 5].includes(size) || !Number.isSafeInteger(count) || count < 1 || sale < base)
    throw new BadRequestException('Geçersiz Paket Adedi Veya Bayi Fiyatının Altında Satış');
  const n = BigInt(size);
  const rows: { quantity: number; amount: string; originalAmount: string }[] = [];
  for (let i = 0; i < size; i++) {
    const amount = formatCents(sale / n + (BigInt(i) < sale % n ? 1n : 0n));
    const originalAmount = formatCents(base / n + (BigInt(i) < base % n ? 1n : 0n));
    const row = rows.find(row => row.amount === amount && row.originalAmount === originalAmount);
    if (row) row.quantity += count;
    else rows.push({ quantity: count, amount, originalAmount });
  }
  return rows;
}
