-- ============================================
-- MIGRATION 018: Egresos categories alignment
-- Adds the 6 categories that exist in the code (zod schema + frontend
-- CATEGORIES map) but were missing from the egreso_category enum,
-- which caused POST /api/egresos to 500 with
-- "invalid input value for enum egreso_category".
-- ============================================

ALTER TYPE egreso_category ADD VALUE IF NOT EXISTS 'renta';
ALTER TYPE egreso_category ADD VALUE IF NOT EXISTS 'internet';
ALTER TYPE egreso_category ADD VALUE IF NOT EXISTS 'insumos';
ALTER TYPE egreso_category ADD VALUE IF NOT EXISTS 'mantenimiento';
ALTER TYPE egreso_category ADD VALUE IF NOT EXISTS 'seguros';
ALTER TYPE egreso_category ADD VALUE IF NOT EXISTS 'otros';
