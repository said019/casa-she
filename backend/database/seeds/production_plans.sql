-- ============================================
-- PRODUCTION PLANS SEED
-- ============================================
-- These are the plans currently active in production (Catarsis Studio)

-- Disable existing plans first to avoid duplicates/confusion if re-seeding
UPDATE plans SET is_active = false;

INSERT INTO plans (name, price, duration_days, class_limit, description, features, is_active, sort_order) VALUES
('Sesión Suelta', 100.00, 30, 1, 'Clase individual para socias', '["Acceso a una clase"]'::jsonb, true, 1),
('Sesión Prueba', 199.00, 30, 1, 'Primera clase de prueba', '["Acceso a una clase", "Válido por 30 días"]'::jsonb, true, 0),
('4 Clases Mensuales', 520.00, 30, 4, '4 clases al mes', '["4 clases", "Válido por 30 días"]'::jsonb, true, 2),
('6 Clases Mensuales', 720.00, 30, 6, '6 clases al mes', '["6 clases", "Válido por 30 días"]'::jsonb, true, 3),
('8 Clases Mensuales', 920.00, 45, 8, '8 clases al mes - Plan más popular', '["8 clases", "Válido por 45 días", "Plan Recomendado"]'::jsonb, true, 4),
('10 Clases Mensuales', 1120.00, 30, 10, '10 clases al mes', '["10 clases", "Válido por 30 días"]'::jsonb, true, 5),
('12 Clases Mensuales', 1320.00, 30, 12, '12 clases al mes', '["12 clases", "Válido por 30 días"]'::jsonb, true, 6),
('Clases Ilimitadas', 1520.00, 30, NULL, 'Acceso ilimitado mensual', '["Clases ilimitadas", "Válido por 30 días", "Acceso total"]'::jsonb, true, 7);
