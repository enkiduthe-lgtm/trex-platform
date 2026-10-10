CREATE TYPE current_account_party_type AS ENUM ('DEALER','CUSTOMER');
CREATE TYPE current_account_entry_type AS ENUM ('SALE','COLLECTION','RETURN','COMMISSION_USE','ADJUSTMENT');

CREATE TABLE current_account_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type current_account_party_type NOT NULL,
  dealer_id uuid REFERENCES dealers(id),
  customer_id uuid REFERENCES customers(id),
  direction dealer_ledger_direction NOT NULL,
  entry_type current_account_entry_type NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','EUR','USD')),
  source_type text NOT NULL,
  source_id uuid,
  description text NOT NULL,
  created_by uuid REFERENCES users(id),
  reversal_of_id uuid REFERENCES current_account_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT current_account_party_target CHECK (
    (party_type='DEALER' AND dealer_id IS NOT NULL AND customer_id IS NULL) OR
    (party_type='CUSTOMER' AND customer_id IS NOT NULL AND dealer_id IS NULL)
  ),
  CONSTRAINT current_account_entry_direction CHECK (
    (entry_type='SALE' AND direction='DEBIT') OR
    (entry_type IN ('COLLECTION','RETURN','COMMISSION_USE') AND direction='CREDIT') OR
    entry_type='ADJUSTMENT'
  )
);
CREATE INDEX current_account_entries_party_idx ON current_account_entries(party_type,dealer_id,customer_id,created_at DESC);
CREATE UNIQUE INDEX current_account_entries_source_unique ON current_account_entries(party_type,source_type,source_id,entry_type) WHERE source_id IS NOT NULL;

INSERT INTO current_account_entries(party_type,dealer_id,direction,entry_type,amount,currency,source_type,source_id,description,created_by,created_at)
SELECT 'DEALER',dealer_id,direction,'ADJUSTMENT',amount,currency,reference_type,reference_id,description,created_by,created_at
FROM dealer_ledger_entries;

CREATE OR REPLACE FUNCTION prevent_current_account_entry_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Cari hareketler değiştirilemez; ters kayıt oluşturun';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER current_account_entries_immutable
BEFORE UPDATE OR DELETE ON current_account_entries
FOR EACH ROW EXECUTE FUNCTION prevent_current_account_entry_mutation();
