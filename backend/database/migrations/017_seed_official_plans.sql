-- Migration 017: Replace all plans with the 5 official Balance Room packages
-- Deactivate all existing plans, then upsert the 5 official ones.

-- Deactivate everything currently active
UPDATE plans SET is_active = false WHERE is_active = true;

-- Insert official plans (idempotent: skip if same name already exists as active)
INSERT INTO plans (name, description, price, duration_days, class_limit, is_active, sort_order)
VALUES
  ('Clase suelta',      NULL, 200,   30,  1, true, 1),
  ('Paquete 4 clases',  NULL, 750,   30,  4, true, 2),
  ('Paquete 8 clases',  NULL, 1450,  60,  8, true, 3),
  ('Paquete 12 clases', NULL, 2100,  60, 12, true, 4),
  ('Paquete 24 clases', NULL, 2900,  90, 24, true, 5)
ON CONFLICT DO NOTHING;

-- Remove inscription/enrollment conditions if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'enrollment_conditions') THEN
    DELETE FROM enrollment_conditions;
  END IF;
END $$;
