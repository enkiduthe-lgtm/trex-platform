// The alias t refers to finance_transactions.
export const realizedCash = `(t.payment_status IS NULL OR t.payment_status='PAID'
  OR (t.kind='REFUND' AND t.payment_status='REFUNDED'))`;

export const pendingCollection = `t.kind='COLLECTION' AND t.approved_at IS NULL
  AND t.payment_status IN ('PENDING','PARTIALLY_PAID','COLLECTION_PENDING','OVERDUE')`;

export const editableFinanceMovement = `NOT (t.order_id IS NOT NULL OR t.transfer_group_id IS NOT NULL OR t.approved_at IS NOT NULL
  OR EXISTS (SELECT 1 FROM marketplace_settlements m WHERE m.finance_transaction_id=t.id)
  OR EXISTS (SELECT 1 FROM carrier_settlements s WHERE s.finance_transaction_id=t.id)
  OR EXISTS (SELECT 1 FROM return_refunds r WHERE r.finance_transaction_id=t.id)
  OR EXISTS (SELECT 1 FROM commission_entries e WHERE e.finance_transaction_id=t.id)
  OR EXISTS (SELECT 1 FROM dealer_prim_requests p WHERE p.finance_transaction_id=t.id))`;

export function visibleFinanceMovement(canSeeAllParameter: number, actorParameter: number) {
  return `($${canSeeAllParameter}::boolean OR NOT EXISTS (
    SELECT 1 FROM commission_entries e WHERE e.finance_transaction_id=t.id
      AND e.staff_role='DIRECTOR' AND e.recipient_user_id<>$${actorParameter}::uuid
  ))`;
}
