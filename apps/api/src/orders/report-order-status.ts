// Report status is derived without changing the order or warehouse workflow.
// A full return requires completed returns for every ordered unit.
export const reportOrderStatus = `CASE
  WHEN o.status::text IN ('CANCELLED', 'REFUNDED') THEN o.status::text
  WHEN EXISTS (SELECT 1 FROM returns r WHERE r.order_id=o.id AND r.status='REFUNDED')
    AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id=o.id)
    AND NOT EXISTS (
      SELECT 1 FROM order_items oi WHERE oi.order_id=o.id AND oi.quantity > (
        SELECT COALESCE(SUM(ri.quantity),0)
        FROM return_items ri JOIN returns r ON r.id=ri.return_id
        WHERE ri.order_item_id=oi.id AND r.order_id=o.id AND r.status='REFUNDED'
      )
    ) THEN 'REFUNDED'
  ELSE o.status::text
END`;

export const completedRefundAmount = `COALESCE((
  SELECT SUM(rr.amount) FROM return_refunds rr JOIN returns r ON r.id=rr.return_id
  WHERE r.order_id=o.id AND r.status='REFUNDED' AND rr.currency=o.currency
),0)`;

export const netOrderAmount = `GREATEST(o.total_amount-${completedRefundAmount},0)`;

export const orderQueueStages = ['PENDING_PAYMENT','PAID','PROCESSING','REGISTERED','SHIPPED','DELIVERED','CARRIER_RETURN','REFUNDED','CANCELLED'];

export const orderQueueStatusSql = `CASE
  WHEN (${reportOrderStatus})='REFUNDED' THEN 'REFUNDED'
  WHEN o.status='CANCELLED' THEN 'CANCELLED'
  WHEN s.tracking_direction_code='3' THEN 'CARRIER_RETURN'
  WHEN o.status='PROCESSING' AND s.status='CREATED' THEN 'REGISTERED'
  WHEN o.status='PROCESSING' AND s.status='IN_TRANSIT' THEN 'SHIPPED'
  WHEN o.status='PROCESSING' AND s.status='DELIVERED' THEN 'DELIVERED'
  ELSE o.status::text
END`;

export const manualCancellationChannels = ['ADMIN_ORDER','RETAIL','WHOLESALE','INSTAGRAM','DEALER_PORTAL'];
export const manualCancellationStatuses = ['PENDING_PAYMENT','PAID','PROCESSING'];
export const manualPaymentProviders = ['bank_transfer','cash','cash_on_delivery_card','cash_on_delivery_cash'];
export const editableAdminChannels = ['ADMIN_ORDER','RETAIL','WHOLESALE','PUBLIC_WEB','INSTAGRAM','MARKETPLACE'];
export const financialEditStatuses = ['PENDING_PAYMENT','PROCESSING'];

const sqlValues = (values: string[]) => values.map(value => `'${value}'`).join(',');
export const hasApprovedCollection = `EXISTS (
  SELECT 1 FROM finance_transactions t WHERE t.order_id=o.id AND t.approved_at IS NOT NULL
)`;
export const hasPackedOrder = `EXISTS (
  SELECT 1 FROM packing_sessions pk JOIN picking_sessions ps ON ps.id=pk.picking_session_id
  WHERE ps.order_id=o.id AND pk.packed_at IS NOT NULL
)`;
export const orderPriceEditable = `(
  o.archived_at IS NULL
  AND o.sales_channel IN (${sqlValues(editableAdminChannels)})
  AND o.status IN (${sqlValues(financialEditStatuses)})
  AND (${reportOrderStatus}) <> 'REFUNDED'
  AND EXISTS (SELECT 1 FROM payments p WHERE p.checkout_id=o.checkout_id
    AND p.status='PENDING' AND p.provider IN (${sqlValues(manualPaymentProviders)}))
  AND NOT ${hasApprovedCollection}
  AND NOT ${hasPackedOrder}
)`;
export const canCancelOrder = `(
  o.archived_at IS NULL
  AND o.sales_channel IN (${sqlValues(manualCancellationChannels)})
  AND o.status IN (${sqlValues(manualCancellationStatuses)})
  AND (${reportOrderStatus}) <> 'REFUNDED'
  AND EXISTS (SELECT 1 FROM payments p WHERE p.checkout_id=o.checkout_id AND (
    (p.provider='dealer_commission' AND p.status='SUCCEEDED') OR
    (p.provider IN (${sqlValues(manualPaymentProviders)}) AND p.status='PENDING')
  ))
  AND NOT ${hasApprovedCollection}
  AND NOT ${hasPackedOrder}
)`;
