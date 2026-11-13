// The alias t refers to finance_transactions.
export const realizedCash = `(t.payment_status IS NULL OR t.payment_status='PAID'
  OR (t.kind='REFUND' AND t.payment_status='REFUNDED'))`;

export const pendingCollection = `t.kind='COLLECTION' AND t.approved_at IS NULL
  AND t.payment_status IN ('PENDING','PARTIALLY_PAID','COLLECTION_PENDING','OVERDUE')`;
