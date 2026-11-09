import type { DealerPrice } from './dealer-prices';
export function dealerPackSummary(pack:Pick<DealerPrice,'amount'|'currency'>,single:Pick<DealerPrice,'amount'|'currency'>|undefined,size:number) {
  const amount=Number(pack.amount);
  if(!Number.isFinite(amount)||amount<0||!Number.isInteger(size)||size<2)return null;
  const format=(value:number)=>value.toLocaleString('tr-TR',{style:'currency',currency:pack.currency});
  const saving=single&&single.currency===pack.currency?Math.round(Number(single.amount)*100)*size-Math.round(amount*100):0;
  return {unitPrice:format(amount/size),saving:Number.isFinite(saving)&&saving>0?format(saving/100):null};
}
