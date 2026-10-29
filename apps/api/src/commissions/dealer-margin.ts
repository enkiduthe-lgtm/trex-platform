export function dealerMarginAmount(base: string, sale: string, quantity: number): string {
  const cents = (value: string) => {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Geçersiz Fiyat');
    const [whole, fraction=''] = value.split('.');
    return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  };
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Geçersiz Adet');
  const difference = cents(sale)-cents(base);
  if (difference < 0n) throw new Error('Bayi Seviye Fiyatının Altında Satış Yapılamaz');
  const amount = difference*BigInt(quantity);
  return `${amount/100n}.${String(amount%100n).padStart(2,'0')}`;
}
