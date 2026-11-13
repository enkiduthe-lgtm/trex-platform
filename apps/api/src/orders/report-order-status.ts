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
