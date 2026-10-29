-- Add a discriminator only for new margin-based earnings. Historical rows are untouched.
ALTER TABLE commission_entries ADD COLUMN calculation_source text;
CREATE UNIQUE INDEX commission_entries_dealer_margin_unique
  ON commission_entries(dealer_id,order_item_id)
  WHERE calculation_source='DEALER_MARGIN_V1' AND entry_kind='EARN';
