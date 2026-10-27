-- Keep the legacy product image URL while the asset record remains the source
-- of truth. This also lets existing products display their latest image.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url text;
