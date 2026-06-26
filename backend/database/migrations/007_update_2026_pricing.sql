-- Update 2026 Pricing

-- 1. Rename and Update existing valid plans
-- Sesión Prueba -> Sesión Muestra o Individual
UPDATE plans 
SET name = 'Sesión Muestra o Individual', 
    price = 150.00, 
    description = 'Acceso a una clase de prueba o individual',
    updated_at = NOW()
WHERE id = 'cd305118-711f-489f-bb15-a8bbbc34560a';

-- Sesión Suelta -> Sesión Extra
UPDATE plans 
SET name = 'Sesión Extra (Socias o Inscritas)', 
    price = 120.00, 
    description = 'Clase extra para socias con membresía activa',
    updated_at = NOW()
WHERE id = '22222222-2222-2222-2222-222222222222';

-- 4 Clases -> Una Sesión (4 al Mes)
UPDATE plans 
SET name = 'Una Sesión (4 al Mes)', 
    price = 570.00, 
    class_limit = 4,
    description = '4 sesiones mensuales',
    updated_at = NOW()
WHERE id = '33333333-3333-3333-3333-333333333333';

-- 8 Clases -> Dos Sesiones (8 al Mes)
UPDATE plans 
SET name = 'Dos Sesiones (8 al Mes)', 
    price = 870.00, 
    class_limit = 8,
    description = '8 sesiones mensuales',
    updated_at = NOW()
WHERE id = '0130ec92-a876-45a8-b675-6670deafa9b2';

-- 12 Clases -> Tres Sesiones (12 al Mes)
UPDATE plans 
SET name = 'Tres Sesiones (12 al Mes)', 
    price = 1040.00, 
    class_limit = 12,
    description = '12 sesiones mensuales',
    updated_at = NOW()
WHERE id = '77777777-7777-7777-7777-777777777777';

-- 2. Deactivate obsolete plans
UPDATE plans 
SET is_active = false, updated_at = NOW()
WHERE id IN (
    '44444444-4444-4444-4444-444444444444', -- 6 Clases
    '66666666-6666-6666-6666-666666666666', -- 10 Clases
    '417d241b-2afd-47ae-b295-c724d9c91b68', -- 12 Clases (Duplicate)
    '39786810-20a5-4685-8bd7-c00a54a0c70e'  -- Ilimitadas
);

-- 3. Insert new plans
INSERT INTO plans (name, price, currency, duration_days, class_limit, description, sort_order) VALUES
('Cuatro Sesiones (16 al Mes)', 1230.00, 'MXN', 30, 16, '16 sesiones mensuales', 6),
('Cinco Sesiones (20 al Mes)', 1420.00, 'MXN', 30, 20, '20 sesiones mensuales', 7),
('Seis Sesiones (24 al Mes)', 1600.00, 'MXN', 30, 24, '24 sesiones mensuales', 8),
('Siete Sesiones (28 al Mes)', 1750.00, 'MXN', 30, 28, '28 sesiones mensuales', 9),
('Inscripción (Pago Anual)', 500.00, 'MXN', 365, 0, 'Pago anual de inscripción', 0);
