type SearchableOrder = { order_number:string; customer_name?:string|null; customer_email?:string|null; sales_channel?:string|null; marketplace_name?:string|null; products?:{product_name:string;sku:string}[] };
export function matchesOrderSearch(order:SearchableOrder, query:string, channelLabel?:string) {
  const text = [order.order_number,order.customer_name,order.customer_email,order.sales_channel,channelLabel,order.marketplace_name,...(order.products ?? []).flatMap(product=>[product.product_name,product.sku])].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
  return text.includes(query.trim().toLocaleLowerCase('tr-TR'));
}
