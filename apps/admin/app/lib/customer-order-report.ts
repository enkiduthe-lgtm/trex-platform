import { paymentLabel } from "./payment-label";
import { countsTowardSales, currencyTotals } from './report-totals';
import { financeDateTime } from './finance-report';

export type CustomerOrderReportLine = {
  order_number: string; created_at: string; status: string; currency: string;
  sales_channel: string; product_name: string; sku: string; quantity: number;
  unit_amount: string; line_total: string; payment_method: string;
  refunded_quantity?: number; order_refunded_amount?: string; order_net_amount?: string;
};
const statuses: Record<string,string> = { PENDING_PAYMENT:'Ödeme Bekliyor', PAID:'Onaylandı', PROCESSING:'Hazırlanıyor', SHIPPED:'Kargoya Verildi', DELIVERED:'Teslim Edildi', CANCELLED:'İptal Edildi', REFUNDED:'İade Edildi' };
const channels: Record<string,string> = { RETAIL:'Perakende', WHOLESALE:'Toptan', PUBLIC_WEB:'Site', INSTAGRAM:'Instagram', DEALER_PORTAL:'Sistem Bayi', MARKETPLACE:'Pazaryeri', ADMIN_ORDER:'Yönetici Siparişi' };

export function customerOrderReportRows(lines: CustomerOrderReportLine[], from: string, to: string) {
  const totals = (status: string) => currencyTotals(lines.filter(line => status === 'ACTIVE'
    ? countsTowardSales(line) : line.status === status)
    .map(line => ({currency:line.currency,amount:line.line_total})));
  const orders = new Map(lines.map(line => [line.order_number, line]));
  const refunds = currencyTotals([...orders.values()].flatMap(order => order.order_refunded_amount && Number(order.order_refunded_amount) > 0
    ? [{currency:order.currency,amount:order.order_refunded_amount}] : []));
  const net = currencyTotals([...orders.values()].flatMap(order => countsTowardSales(order) && order.order_net_amount !== undefined
    ? [{currency:order.currency,amount:order.order_net_amount}] : []));
  return [
    ['Başlangıç', from || 'Tüm Geçmiş'], ['Bitiş', to || 'Sınır Yok'], ['Saat Dilimi','Europe/Istanbul'], [],
    ['Sipariş Tarihi','Sipariş Numarası','Ürün','SKU','Adet','Gerçek Birim Fiyat','Ürün Satır Tutarı','Para Birimi','Ödeme Yöntemi','Sipariş Durumu','Satış Kanalı','İade Edilen Adet'],
    ...lines.map(line => [financeDateTime(line.created_at),line.order_number,line.product_name,line.sku,line.quantity,
      Number(line.unit_amount),Number(line.line_total),line.currency,paymentLabel(line.payment_method),
      statuses[line.status] ?? line.status,channels[line.sales_channel] ?? line.sales_channel,line.refunded_quantity ?? '']),
    [], ['İlk Ürün Tutarları · Kargo Ve Hizmet Bedelleri Hariç'],
    ...totals('ACTIVE').map(total => ['İptal Ve Tam İadeler Hariç',total.currency,Number(total.amount)]),
    ...totals('CANCELLED').map(total => ['İptal Edilen Siparişlerin Ürün Tutarı',total.currency,Number(total.amount)]),
    ...totals('REFUNDED').map(total => ['İade Durumundaki Siparişlerin Ürün Tutarı',total.currency,Number(total.amount)]),
    ...(refunds.length || net.length ? [[], ['Sipariş Toplamları · Kargo Ve Hizmet Bedelleri Dahil'],
      ...refunds.map(total => ['Tamamlanan İadelerin Ödeme Tutarı',total.currency,Number(total.amount)]),
      ...net.map(total => ['İadeler Düşüldükten Sonraki Net Sipariş Tutarı',total.currency,Number(total.amount)]),
    ] : []),
  ];
}
