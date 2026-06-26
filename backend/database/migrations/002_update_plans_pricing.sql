-- Migration: Update plans with Catarsis pricing structure
-- Based on official pricing from client

-- First, clear existing plans
DELETE FROM plans;

-- Insert updated plans with correct pricing
-- Note: class_limit NULL means unlimited classes

-- INSCRIPCIÓN (Pago anual)
INSERT INTO plans (
  id,
  name,
  description,
  price,
  currency,
  duration_days,
  class_limit,
  features,
  is_active,
  sort_order
) VALUES (
  gen_random_uuid(),
  'Inscripción',
  'PAGO ANUAL',
  500.00,
  'MXN',
  365,
  NULL,
  '["Válido por 1 año", "Requerido para todos los miembros", "Pago único anual"]'::jsonb,
  true,
  0
);

-- SESIÓN PRUEBA
INSERT INTO plans (
  id,
  name,
  description,
  price,
  currency,
  duration_days,
  class_limit,
  features,
  is_active,
  sort_order
) VALUES (
  gen_random_uuid(),
  'Sesión Prueba',
  'PRIMERA CLASE',
  140.00,
  'MXN',
  30,
  1,
  '["1 clase de prueba", "Ideal para nuevos alumnos", "Sin compromiso"]'::jsonb,
  true,
  1
);

-- SESIÓN SUELTA (Precio socias o inscritas)
INSERT INTO plans (
  id,
  name,
  description,
  price,
  currency,
  duration_days,
  class_limit,
  features,
  is_active,
  sort_order
) VALUES (
  gen_random_uuid(),
  'Sesión Suelta',
  'PRECIO SOCIAS O INSCRITAS',
  100.00,
  'MXN',
  30,
  1,
  '["1 clase", "Solo para miembros inscritos", "Válido por 30 días"]'::jsonb,
  true,
  2
);

-- UNA SESIÓN (4 sesiones al mes)
INSERT INTO plans (
  id,
  name,
  description,
  price,
  currency,
  duration_days,
  class_limit,
  features,
  is_active,
  sort_order
) VALUES (
  gen_random_uuid(),
  'Una Sesión',
  '4 SESIONES AL MES',
  520.00,
  'MXN',
  30,
  4,
  '["4 clases al mes", "1 clase por semana", "Válido por 30 días"]'::jsonb,
  true,
  3
);

-- DOS SESIONES (8 sesiones al mes)
INSERT INTO plans (
  id,
  name,
  description,
  price,
  currency,
  duration_days,
  class_limit,
  features,
  is_active,
  sort_order
) VALUES (
  gen_random_uuid(),
  'Dos Sesiones',
  '8 SESIONES AL MES',
  720.00,
  'MXN',
  30,
  8,
  '["8 clases al mes", "2 clases por semana", "Válido por 30 días"]'::jsonb,
  true,
  4
);

-- TRES SESIONES (12 sesiones al mes)
INSERT INTO plans (
  id,
  name,
  description,
  price,
  currency,
  duration_days,
  class_limit,
  features,
  is_active,
  sort_order
) VALUES (
  gen_random_uuid(),
  'Tres Sesiones',
  '12 SESIONES AL MES',
  920.00,
  'MXN',
  30,
  12,
  '["12 clases al mes", "3 clases por semana", "Válido por 30 días"]'::jsonb,
  true,
  5
);

-- CUATRO SESIONES (16 sesiones al mes)
INSERT INTO plans (
  id,
  name,
  description,
  price,
  currency,
  duration_days,
  class_limit,
  features,
  is_active,
  sort_order
) VALUES (
  gen_random_uuid(),
  'Cuatro Sesiones',
  '16 SESIONES AL MES',
  1120.00,
  'MXN',
  30,
  16,
  '["16 clases al mes", "4 clases por semana", "Válido por 30 días"]'::jsonb,
  true,
  6
);

-- CINCO SESIONES (20 sesiones al mes)
INSERT INTO plans (
  id,
  name,
  description,
  price,
  currency,
  duration_days,
  class_limit,
  features,
  is_active,
  sort_order
) VALUES (
  gen_random_uuid(),
  'Cinco Sesiones',
  '20 SESIONES AL MES',
  1320.00,
  'MXN',
  30,
  20,
  '["20 clases al mes", "5 clases por semana", "Válido por 30 días"]'::jsonb,
  true,
  7
);

-- SEIS SESIONES (24 sesiones al mes)
INSERT INTO plans (
  id,
  name,
  description,
  price,
  currency,
  duration_days,
  class_limit,
  features,
  is_active,
  sort_order
) VALUES (
  gen_random_uuid(),
  'Seis Sesiones',
  '24 SESIONES AL MES',
  1520.00,
  'MXN',
  30,
  24,
  '["24 clases al mes", "6 clases por semana", "Válido por 30 días", "Máximo ahorro"]'::jsonb,
  true,
  8
);
