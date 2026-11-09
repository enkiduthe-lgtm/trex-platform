import { currencyTotals } from './report-totals';
type Entry={amount:string;status:string;entry_kind:string;staff_paid_amount:string|null};
export function staffPaymentTotals(entries:Entry[]) {
 const sum=(amounts:string[])=>currencyTotals(amounts.map(amount=>({currency:'TRY',amount})))[0]?.amount ?? '0.00';
 const net=sum(entries.map(entry=>entry.amount));
 const paid=sum(entries.filter(entry=>entry.status==='PAID'&&entry.entry_kind==='EARN').map(entry=>entry.staff_paid_amount??entry.amount));
 const unpaid=sum([net,paid.startsWith('-')?paid.slice(1):'-'+paid]);
 return {net,paid,unpaid};
}
