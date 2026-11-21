import {inFinancePeriod} from './finance-report';
type Movement={account_id:string;account_name:string;currency:string;occurred_at:string};
export function matchesFinanceMovement(row:Movement,accountId:string,dateFrom:string,dateTo:string){
 return (accountId==='ALL'||row.account_id===accountId)&&inFinancePeriod(row.occurred_at,dateFrom,dateTo);
}
export function financeMovementAccounts(rows:Movement[]){
 const accounts=new Map<string,{id:string;name:string;currency:string}>();
 for(const row of rows)accounts.set(row.account_id,{id:row.account_id,name:row.account_name,currency:row.currency});
 return [...accounts.values()].sort((a,b)=>a.name.localeCompare(b.name,'tr')||a.currency.localeCompare(b.currency)||a.id.localeCompare(b.id));
}
