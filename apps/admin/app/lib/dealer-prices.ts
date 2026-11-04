export type DealerPrice={id:string;product_id:string;dealer_level_id:string|null;scope:string;amount:string;currency:string;pack_size?:number;starts_at:string;ends_at:string|null};
// Match the order service's effective-time, pack-size and newest-rule selection.
export function effectiveDealerPrice(prices:DealerPrice[],productId:string,levelId:string,size:number,now=new Date()):DealerPrice|undefined{
  const at=now.getTime();
  return prices.filter(price=>price.scope==='DEALER_LEVEL'&&price.product_id===productId&&price.dealer_level_id===levelId&&(price.pack_size??1)===size&&new Date(price.starts_at).getTime()<=at&&(!price.ends_at||new Date(price.ends_at).getTime()>at)).sort((a,b)=>new Date(b.starts_at).getTime()-new Date(a.starts_at).getTime()||b.id.localeCompare(a.id))[0];
}
