-- Normalize plan names: use numbers consistently and ensure old duplicates are deactivated

-- 1. Deactivate old duplicate plans that should already be inactive
UPDATE plans
SET is_active = false, updated_at = NOW()
WHERE id IN (
    '44444444-4444-4444-4444-444444444444', -- 6 Clases (old)
    '66666666-6666-6666-6666-666666666666', -- 10 Clases (old)
    '417d241b-2afd-47ae-b295-c724d9c91b68', -- 12 Clases (old duplicate)
    '39786810-20a5-4685-8bd7-c00a54a0c70e'  -- Ilimitadas (old)
)
AND is_active = true;

-- 2. Rename active plans to use numbers instead of words
UPDATE plans SET name = '1 Sesión (4 al Mes)', sort_order = 3, updated_at = NOW()
WHERE id = '33333333-3333-3333-3333-333333333333';

UPDATE plans SET name = '2 Sesiones (8 al Mes)', sort_order = 4, updated_at = NOW()
WHERE id = '0130ec92-a876-45a8-b675-6670deafa9b2';

UPDATE plans SET name = '3 Sesiones (12 al Mes)', sort_order = 5, updated_at = NOW()
WHERE id = '77777777-7777-7777-7777-777777777777';

-- For plans inserted by migration 007 (no fixed IDs), update by name
UPDATE plans SET name = '4 Sesiones (16 al Mes)', sort_order = 6, updated_at = NOW()
WHERE name = 'Cuatro Sesiones (16 al Mes)' AND is_active = true;

UPDATE plans SET name = '5 Sesiones (20 al Mes)', sort_order = 7, updated_at = NOW()
WHERE name = 'Cinco Sesiones (20 al Mes)' AND is_active = true;

UPDATE plans SET name = '6 Sesiones (24 al Mes)', sort_order = 8, updated_at = NOW()
WHERE name = 'Seis Sesiones (24 al Mes)' AND is_active = true;

UPDATE plans SET name = '7 Sesiones (28 al Mes)', sort_order = 9, updated_at = NOW()
WHERE name = 'Siete Sesiones (28 al Mes)' AND is_active = true;

-- 3. Ensure Clase Suelta (Sesión Extra) is active and properly named
UPDATE plans SET name = 'Clase Suelta', sort_order = 2, is_active = true, updated_at = NOW()
WHERE id = '22222222-2222-2222-2222-222222222222';
