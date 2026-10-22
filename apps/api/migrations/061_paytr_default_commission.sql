-- PayTR site sales use the agreed default deduction unless the owner later changes it.
ALTER TABLE paytr_finance_settings
  ALTER COLUMN commission_rate SET DEFAULT 3.89;

UPDATE paytr_finance_settings
SET commission_rate = 3.89
WHERE singleton = true
  AND commission_rate = 3.69;
