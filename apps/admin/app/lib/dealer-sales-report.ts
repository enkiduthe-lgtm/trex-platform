import { financeDate } from './finance-report';
import { currencyTotals } from './report-totals';

export type DealerSale = { item_id:string; dealer_id:string; dealer_code:string; company_name:string; dealer_level_id:string|null; dealer_level_name:string|null; order_id:string; order_number:string; created_at:string; status:string; total_amount:string; currency:string; product_name:string; sku:string; quantity:number; unit_amount:string; line_total:string; payment_status:string };
export function groupDealerSales(rows:DealerSale[],mode:'dealer'|'product'|'day') {
  const groups=new Map<string,{label:string;level:string;currency:string;status:string;orders:Set<string>;quantity:number;amounts:{currency:string;amount:string}[]}>();
  for(const row of rows){
    const label=mode==='dealer'?`${row.company_name} · ${row.dealer_code}`:mode==='product'?`${row.product_name} · ${row.sku}`:financeDate(row.created_at);
    const level=mode==='dealer'?(row.dealer_level_name??'Sipariş Seviyesi Kaydedilmemiş'):'';
    const identity=mode==='dealer'?row.dealer_id:mode==='product'?row.sku:label;
    const currency=row.currency.trim(),key=JSON.stringify([identity,mode==='dealer'?row.dealer_level_id:label,row.status,currency]);
    const group=groups.get(key)??{label,level,currency,status:row.status,orders:new Set<string>(),quantity:0,amounts:[]};
    group.orders.add(row.order_id);group.quantity+=Number(row.quantity);group.amounts.push({currency,amount:row.line_total});groups.set(key,group);
  }
  return [...groups.values()].map(group=>({label:group.label,level:group.level,currency:group.currency,status:group.status,orderCount:group.orders.size,quantity:group.quantity,amount:currencyTotals(group.amounts)[0].amount})).sort((a,b)=>a.label.localeCompare(b.label,'tr')||a.currency.localeCompare(b.currency)||a.status.localeCompare(b.status));
}
