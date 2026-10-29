CREATE TABLE dealer_prim_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_key uuid NOT NULL UNIQUE,
 dealer_id uuid NOT NULL REFERENCES dealers(id), amount numeric(12,2) NOT NULL CHECK(amount>0),
 currency char(3) NOT NULL DEFAULT 'TRY', status text NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','APPROVED','PAID','REJECTED','CANCELLED')),
 due_date date NOT NULL, account_holder text NOT NULL, iban text NOT NULL,
 requested_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 approved_by uuid REFERENCES users(id), approved_at timestamptz,
 paid_by uuid REFERENCES users(id), paid_at timestamptz, finance_transaction_id uuid UNIQUE REFERENCES finance_transactions(id), reference_number text, note text
);
CREATE INDEX dealer_prim_requests_dealer_idx ON dealer_prim_requests(dealer_id,currency,status);
CREATE TABLE dealer_prim_deductions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dealer_id uuid NOT NULL REFERENCES dealers(id),
 return_id uuid NOT NULL UNIQUE REFERENCES returns(id), amount numeric(12,2) NOT NULL CHECK(amount>0),
 currency char(3) NOT NULL, note text NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dealer_prim_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dealer_id uuid NOT NULL REFERENCES dealers(id), order_id uuid NOT NULL REFERENCES orders(id),
 return_id uuid UNIQUE REFERENCES returns(id), amount numeric(12,2) NOT NULL CHECK(amount>0),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dealer_prim_cancel_refund_unique ON dealer_prim_refunds(order_id) WHERE return_id IS NULL;
-- Internal commission refunds return wallet credit, so there is no bank cash transaction.
ALTER TABLE return_refunds ALTER COLUMN finance_transaction_id DROP NOT NULL;
