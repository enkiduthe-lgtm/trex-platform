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
