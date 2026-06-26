-- NOTA: la versión que SÍ se ejecuta es el bloque inline "Migration 030" en src/index.ts. Este archivo es la copia de referencia/autoritativa del SQL.
-- 030_membership_categories.sql — categoría de clase + créditos por categoría (BMB)
-- Convención: NULL = ilimitado, 0 = sin acceso, N = N créditos.

DO $$ BEGIN
  CREATE TYPE class_category AS ENUM ('reformer', 'multi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE class_types ADD COLUMN IF NOT EXISTS category class_category NOT NULL DEFAULT 'multi';

ALTER TABLE plans ADD COLUMN IF NOT EXISTS reformer_credits INTEGER;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS multi_credits    INTEGER;

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS reformer_remaining INTEGER;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS multi_remaining    INTEGER;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consumed_category class_category;

-- Nota: NO se agregan constraints UNIQUE(name) porque las tablas base traen nombres
-- duplicados (p.ej. "Sala Principal" repetida). El seed (031) es idempotente vía
-- INSERT ... SELECT ... WHERE NOT EXISTS por nombre, sin depender de un constraint.
