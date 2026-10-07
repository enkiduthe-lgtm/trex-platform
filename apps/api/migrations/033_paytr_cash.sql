-- System-generated finance records have no human creator.
ALTER TABLE finance_accounts ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE finance_transactions ALTER COLUMN created_by DROP NOT NULL;
CREATE TABLE paytr_finance_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  commission_rate numeric(5,2) NOT NULL DEFAULT 3.69 CHECK(commission_rate BETWEEN 0 AND 100)
);
INSERT INTO paytr_finance_settings(singleton) VALUES(true);
INSERT INTO finance_accounts(name,account_type) VALUES('PayTR Kasası','BANK') ON CONFLICT(name) DO NOTHING;
CREATE TABLE paytr_receipts (
  payment_id uuid PRIMARY KEY REFERENCES payments(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  account_id uuid NOT NULL REFERENCES finance_accounts(id),
  is_test boolean NOT NULL,
  gross_amount numeric(12,2) NOT NULL CHECK(gross_amount>=0),
  commission_rate numeric(5,2) NOT NULL CHECK(commission_rate BETWEEN 0 AND 100),
  commission_amount numeric(12,2) NOT NULL CHECK(commission_amount>=0),
  net_amount numeric(12,2) NOT NULL CHECK(net_amount>=0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(net_amount=gross_amount-commission_amount)
);
CREATE FUNCTION record_paytr_receipt(payment_uuid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p payments%ROWTYPE; target_order uuid; target_account uuid; rate numeric; fee numeric; test_payment boolean; inserted integer;
BEGIN
  SELECT * INTO p FROM payments WHERE id=payment_uuid AND provider='paytr' AND status='SUCCEEDED' FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM paytr_receipts WHERE payment_id=p.id) THEN RETURN; END IF;
  SELECT id INTO target_order FROM orders WHERE checkout_id=p.checkout_id;
  IF target_order IS NULL THEN RETURN; END IF;
  -- Missing mode is conservatively kept out of the real cash balance.
  SELECT COALESCE((SELECT payload->>'test_mode' FROM payment_callbacks WHERE provider='paytr' AND event_id=p.provider_reference),'1') <> '0' INTO test_payment;
  SELECT commission_rate INTO rate FROM paytr_finance_settings WHERE singleton=true FOR SHARE;
  INSERT INTO finance_accounts(name,account_type,currency) VALUES(CASE WHEN p.currency='TRY' THEN 'PayTR Kasası' ELSE 'PayTR Kasası '||p.currency END,'BANK',p.currency) ON CONFLICT(name) DO NOTHING;
  SELECT id INTO target_account FROM finance_accounts WHERE name=CASE WHEN p.currency='TRY' THEN 'PayTR Kasası' ELSE 'PayTR Kasası '||p.currency END AND currency=p.currency;
  IF target_account IS NULL THEN RAISE EXCEPTION 'PayTR account currency mismatch'; END IF;
  fee := round(p.amount*rate/100,2);
  INSERT INTO paytr_receipts(payment_id,order_id,account_id,is_test,gross_amount,commission_rate,commission_amount,net_amount,currency,created_at)
    VALUES(p.id,target_order,target_account,test_payment,p.amount,rate,fee,p.amount-fee,p.currency,COALESCE(p.verified_at,now())) ON CONFLICT(payment_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted=0 OR test_payment THEN RETURN; END IF;
  -- Gross collection minus separate commission yields the net cash balance.
  IF p.amount>0 THEN
    INSERT INTO finance_transactions(account_id,order_id,kind,amount,payment_status,reference_number,description,occurred_at)
      VALUES(target_account,target_order,'COLLECTION',p.amount,'PAID',p.provider_reference,'PayTR brüt tahsilat',COALESCE(p.verified_at,now()));
  END IF;
  IF fee>0 THEN
    INSERT INTO finance_transactions(account_id,order_id,kind,amount,payment_status,reference_number,description,occurred_at)
      VALUES(target_account,target_order,'COMMISSION',fee,'PAID',p.provider_reference,'PayTR komisyon %'||rate,COALESCE(p.verified_at,now()));
  END IF;
  INSERT INTO audit_logs(action,entity_type,entity_id,metadata) VALUES('finance.paytr.received','payment',p.id::text,jsonb_build_object('gross',p.amount,'rate',rate,'commission',fee,'net',p.amount-fee));
END;
$$;
CREATE FUNCTION paytr_receipt_on_success() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider='paytr' AND NEW.status='SUCCEEDED' THEN PERFORM record_paytr_receipt(NEW.id); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER paytr_finance_success AFTER UPDATE OF status ON payments FOR EACH ROW EXECUTE FUNCTION paytr_receipt_on_success();
-- Include previously confirmed orders, but never fabricate a payment success.
SELECT record_paytr_receipt(id) FROM payments WHERE provider='paytr' AND status='SUCCEEDED';
