type QueueOrder = {status:string;sales_status?:string;shipment_status?:string|null;tracking_direction_code?:string|null};
type QueuePayment = {payment_method?:string|null;payment_status?:string|null};

export function orderQueueStatus(order: QueueOrder) {
  if (order.sales_status === 'REFUNDED') return 'REFUNDED';
  if (['CANCELLED','REFUNDED'].includes(order.status)) return order.status;
  if (order.tracking_direction_code === '3') return 'CARRIER_RETURN';
  if (order.status !== 'PROCESSING') return order.status;
  if (order.shipment_status === 'CREATED') return 'REGISTERED';
  if (order.shipment_status === 'IN_TRANSIT') return 'SHIPPED';
  if (order.shipment_status === 'DELIVERED') return 'DELIVERED';
  return order.status;
}

export function nextPreparationAction(order: QueueOrder & QueuePayment & {preparation_status?:string|null;packed_at?:string|null;package_barcode?:string|null}): 'prepare'|'pack'|'ship'|null {
  if(order.sales_status==='REFUNDED')return null;
  if(!['PAID','PROCESSING'].includes(order.status))return null;
  if(order.tracking_direction_code==='3')return null;
  if(order.shipment_status && order.shipment_status!=='FAILED')return null;
  if(order.packed_at)return order.status==='PROCESSING' && (order.package_barcode === undefined || order.package_barcode?.trim()) ? 'ship' : null;
  if(order.preparation_status==='COMPLETED')return 'pack';
  if(order.preparation_status && !['OPEN','IN_PROGRESS'].includes(order.preparation_status))return null;
  if(order.status==='PROCESSING' && order.payment_status !== undefined &&
    order.payment_status !== 'SUCCEEDED' &&
    !(order.payment_status === 'PENDING' && ['cash_on_delivery_cash','cash_on_delivery_card'].includes(order.payment_method ?? '')))return null;
  return 'prepare';
}

export function needsTransferMatching(order: QueueOrder & QueuePayment) {
  return orderQueueStatus(order) === "PENDING_PAYMENT" && order.payment_method === "bank_transfer" &&
    (order.payment_status === undefined || order.payment_status === "PENDING");
}
