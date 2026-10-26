ALTER TABLE dealers ADD COLUMN authorized_full_name text;
ALTER TABLE dealers ADD COLUMN monthly_sales_target numeric(14,2);
ALTER TABLE dealers ADD COLUMN company_address text;
ALTER TABLE dealers ADD COLUMN tax_office text;

ALTER TABLE dealer_user_accounts ADD COLUMN agreement_accepted_at timestamptz;

CREATE INDEX dealer_user_accounts_agreement_idx ON dealer_user_accounts(dealer_id, agreement_accepted_at);
