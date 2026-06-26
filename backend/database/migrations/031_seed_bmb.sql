-- NOTA: la versión que SÍ se ejecuta es el bloque inline "Migration 031" en src/index.ts. Este archivo es la copia de referencia/autoritativa del SQL.
-- 031_seed_bmb.sql — sucursales, tipos de clase (con categoría) y planes reales de BMB.
-- Idempotente por nombre vía WHERE NOT EXISTS (no requiere UNIQUE(name), porque las
-- tablas base pueden traer nombres duplicados).

-- Sucursales
INSERT INTO facilities (name, description, capacity, is_active, sort_order)
SELECT v.name, v.description, v.capacity, v.is_active, v.sort_order
FROM (VALUES
  ('BMB Studio Tepa', 'Calle Primero de Mayo 1, Diamante, 54763 Cuautitlán Izcalli, Méx.', 10, true, 0),
  ('BMB Studio San Miguel', 'Cam. a Tepotzotlán 6D, Axotlan, 54715 Cuautitlán Izcalli, Méx.', 10, true, 1)
) AS v(name, description, capacity, is_active, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM facilities f WHERE f.name = v.name);

-- Tipos de clase con categoría
INSERT INTO class_types (name, category, level, duration_minutes, max_capacity)
SELECT v.name, v.category::class_category, v.level::class_level, v.duration_minutes, v.max_capacity
FROM (VALUES
  ('Pilates Reformer','reformer','all',50,8),
  ('Yoga','multi','all',50,12),
  ('Hot Yoga','multi','all',50,12),
  ('Barre','multi','all',50,12),
  ('Hot Barre','multi','all',50,12),
  ('Sculpt','multi','all',50,12),
  ('Hot Sculpt','multi','all',50,12),
  ('Hot Pilates','multi','all',50,12),
  ('Pole Fitness','multi','all',50,10),
  ('Pole Dance','multi','all',50,10),
  ('Flex','multi','all',50,12),
  ('Funcional','multi','all',50,12),
  ('Twerk','multi','all',50,12)
) AS v(name, category, level, duration_minutes, max_capacity)
WHERE NOT EXISTS (SELECT 1 FROM class_types ct WHERE ct.name = v.name);

-- Planes BMB (reformer_credits / multi_credits / price / duration_days)
INSERT INTO plans (name, reformer_credits, multi_credits, price, duration_days, is_active, sort_order)
SELECT v.name, v.reformer_credits, v.multi_credits, v.price, v.duration_days, v.is_active, v.sort_order
FROM (VALUES
  ('Reformer 4',4,0,800,30,true,10),('Reformer 8',8,0,1200,30,true,11),('Reformer 12',12,0,1550,30,true,12),
  ('Reformer 16',16,0,1850,30,true,13),('Reformer 20',20,0,2100,30,true,14),('Reformer 30',30,0,3000,45,true,15),
  ('Multi 4',0,4,550,30,true,20),('Multi 8',0,8,900,30,true,21),('Multi 12',0,12,1200,30,true,22),
  ('Multi 16',0,16,1440,30,true,23),('Multi 20',0,20,1600,30,true,24),('Multi 30',0,30,2100,45,true,25),
  ('Mixta 12',6,6,1450,30,true,30),('Mixta 16',8,8,1700,30,true,31),('Mixta 20',10,10,1900,30,true,32),
  ('Multi full',0,NULL,2800,45,true,40),('Reformer full',NULL,0,3500,45,true,41),('Full access',NULL,NULL,4000,45,true,42),
  ('1ra vez reformer',1,0,100,7,true,50),('1ra vez multi',0,1,75,7,true,51),
  ('Reformer individual',1,0,250,7,true,52),('Multi individual',0,1,150,7,true,53),('Personalizada',1,0,550,7,true,54)
) AS v(name, reformer_credits, multi_credits, price, duration_days, is_active, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.name = v.name);

-- Ventana de cancelación BMB = 12 horas (JSONB; cancel_booking lee (value->>'min_hours')::numeric)
INSERT INTO system_settings (key, value)
  VALUES ('cancellation_policy', '{"enabled": true, "min_hours": 12, "refund_credit_on_cancel": true, "cancellations_per_membership": 2}'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = jsonb_set(system_settings.value, '{min_hours}', '12'::jsonb);
