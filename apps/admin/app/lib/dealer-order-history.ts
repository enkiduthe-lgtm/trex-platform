export type DealerOrderHistory = {
  order_number:string;recipient_name?:string|null;tracking_number?:string|null;
  items?:{id:string;product_name:string;sku:string;quantity:number}[];
};

export function matchesDealerOrder(order:DealerOrderHistory,query:string) {
  const text=[order.order_number,order.recipient_name,order.tracking_number,
    ...(order.items??[]).flatMap(item=>[item.product_name,item.sku])].filter(Boolean).join(' ');
  return text.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR'));
}

export function dealerOrderProductsLabel(order:DealerOrderHistory) {
  return dealerOrderProductLines(order).map(item=>`${item.product_name} × ${item.quantity} adet`).join('; ');
}
export function dealerOrderProductLines(order:DealerOrderHistory){
  const groups=new Map<string,{key:string;product_name:string;sku:string;quantity:number}>();
  for(const item of order.items??[]){
    const key=JSON.stringify([item.sku,item.product_name]);
    const group=groups.get(key)??{key,product_name:item.product_name,sku:item.sku,quantity:0};
    group.quantity+=item.quantity;groups.set(key,group);
  }
  return [...groups.values()];
}
