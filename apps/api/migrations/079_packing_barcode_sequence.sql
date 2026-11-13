CREATE SEQUENCE packing_barcode_number AS bigint START WITH 2000000000000;

SELECT setval(
  'packing_barcode_number',
  GREATEST(2000000000000, COALESCE(MAX(substring(package_barcode FROM 9)::bigint) + 1, 0)),
  false
)
FROM packing_sessions
WHERE package_barcode ~ '^TRX-PKG-[0-9]{1,13}$';
