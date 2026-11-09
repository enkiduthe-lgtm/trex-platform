const labels: Record<string,string> = {
  bank_transfer: 'Havale / EFT', cash: 'Elden Tahsilat',
  cash_on_delivery_card: 'Kapıda Kart', cash_on_delivery_cash: 'Kapıda Nakit',
  paytr: 'PayTR', dealer_commission: 'Prim Bakiyesi',
};
export function paymentLabel(method?: string | null) {
  return method ? labels[method] ?? method : 'Belirtilmemiş';
}
