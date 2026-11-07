export function orderQueueStatus(order: {status:string;shipment_status?:string|null}) {
  if (order.status !== 'PROCESSING') return order.status;
  if (order.shipment_status === 'CREATED') return 'REGISTERED';
  if (order.shipment_status === 'IN_TRANSIT') return 'SHIPPED';
  if (order.shipment_status === 'DELIVERED') return 'DELIVERED';
  return order.status;
}

export function nextPreparationAction(order: {status:string;shipment_status?:string|null;preparation_status?:string|null;packed_at?:string|null}): 'prepare'|'pack'|'ship'|null {
  if(!['PAID','PROCESSING'].includes(order.status))return null;
  if(order.shipment_status && order.shipment_status!=='FAILED')return null;
  if(order.packed_at)return order.status==='PROCESSING'?'ship':null;
  return order.preparation_status==='COMPLETED'?'pack':'prepare';
}
