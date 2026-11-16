-- Southern Cart Co. ONLY: run after 01-schema.sql in its own Supabase project.
-- Extends private supplier information; does not modify E-Z Rent To Own.
ALTER TABLE public.product_supplier_details
 ADD COLUMN IF NOT EXISTS pid text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS vid text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'CN',
 ADD COLUMN IF NOT EXISTS shipping_estimate numeric(12,2),
 ADD COLUMN IF NOT EXISTS shipping_quote_at timestamptz;

ALTER TABLE public.product_supplier_details
 DROP CONSTRAINT IF EXISTS supplier_origin_check;
ALTER TABLE public.product_supplier_details
 ADD CONSTRAINT supplier_origin_check CHECK (origin IN ('CN','US'));

-- Keep all supplier identifiers and cost data restricted to administrators.
-- Existing RLS policies from 01-schema.sql remain in force.
