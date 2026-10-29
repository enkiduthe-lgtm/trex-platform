-- Keep every historical level and price. Only three levels remain assignable.
INSERT INTO dealer_levels(code,name,sort_order)
SELECT 'TREX_LEVEL_'||n,'Seviye '||n,n FROM generate_series(1,3) AS n
WHERE NOT EXISTS(SELECT 1 FROM dealer_levels WHERE sort_order=n)
ON CONFLICT DO NOTHING;
WITH ranked AS (
 SELECT id,row_number() OVER(ORDER BY is_active DESC,sort_order,id) AS position FROM dealer_levels
)
UPDATE dealer_levels d SET is_active=(r.position<=3) FROM ranked r WHERE r.id=d.id;
