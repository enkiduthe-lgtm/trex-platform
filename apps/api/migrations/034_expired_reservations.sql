CREATE FUNCTION release_expired_checkout_reservations() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE checkout_record record; reservation_record record; released_count integer:=0;
BEGIN
  -- Pending provider payments are retained: expiry alone is not proof of failure.
  FOR checkout_record IN SELECT cs.id FROM checkout_sessions cs
    WHERE cs.status='OPEN' AND cs.expires_at<=now()
      AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.checkout_id=cs.id)
      AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.checkout_id=cs.id AND p.status IN ('PENDING','SUCCEEDED'))
    ORDER BY cs.id LIMIT 100 FOR UPDATE OF cs SKIP LOCKED
  LOOP
    -- Recheck after locking against concurrent order/payment completion.
    IF EXISTS(SELECT 1 FROM orders WHERE checkout_id=checkout_record.id)
      OR EXISTS(SELECT 1 FROM payments WHERE checkout_id=checkout_record.id AND status IN ('PENDING','SUCCEEDED')) THEN CONTINUE; END IF;
    FOR reservation_record IN SELECT * FROM stock_reservations
      WHERE reference_type='checkout' AND reference_id=checkout_record.id AND status='ACTIVE' AND expires_at<=now()
      ORDER BY product_id,warehouse_id,id FOR UPDATE
    LOOP
      UPDATE inventory SET reserved_quantity=reserved_quantity-reservation_record.quantity,updated_at=now()
        WHERE product_id=reservation_record.product_id AND warehouse_id=reservation_record.warehouse_id AND reserved_quantity>=reservation_record.quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'Reservation inventory mismatch: %',reservation_record.id; END IF;
      UPDATE stock_reservations SET status='EXPIRED',released_at=now() WHERE id=reservation_record.id;
      INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id)
        VALUES(reservation_record.product_id,reservation_record.warehouse_id,'RELEASE',0,'expired_checkout',checkout_record.id);
      INSERT INTO audit_logs(action,entity_type,entity_id,metadata)
        VALUES('inventory.reservation.expired','stock_reservation',reservation_record.id::text,jsonb_build_object('checkoutId',checkout_record.id,'releasedQuantity',reservation_record.quantity));
      released_count:=released_count+1;
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM stock_reservations WHERE reference_type='checkout' AND reference_id=checkout_record.id AND status='ACTIVE') THEN
      UPDATE checkout_sessions SET status='EXPIRED' WHERE id=checkout_record.id;
    END IF;
  END LOOP;
  RETURN released_count;
END;
$$;
