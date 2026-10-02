ALTER TABLE finance_transactions ADD COLUMN expense_category text;
ALTER TABLE finance_transactions ADD COLUMN cost_center text;
ALTER TABLE finance_transactions ADD COLUMN document_url text;
CREATE INDEX finance_transactions_expense_category_idx ON finance_transactions(expense_category, occurred_at DESC) WHERE expense_category IS NOT NULL;
