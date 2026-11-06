UPDATE shipments s SET tracking_number=NULL FROM orders o WHERE s.order_id=o.id AND s.provider='aras' AND s.tracking_number=o.order_number;
