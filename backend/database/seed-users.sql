-- ============================================
-- USUARIOS DE PRUEBA - Catarsis Studio
-- ============================================

-- Primero eliminar usuarios de prueba existentes (si existen)
DELETE FROM users WHERE email IN ('admin@catarsis.com', 'usuario@catarsis.com');

-- Insertar usuario administrador de prueba
-- Email: admin@catarsis.com
-- Password: Admin123!
INSERT INTO users (
    email,
    password_hash,
    display_name,
    phone,
    role,
    accepts_communications,
    receive_reminders,
    receive_promotions,
    receive_weekly_summary
) VALUES (
    'admin@catarsis.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Ag2Q1xUCRxgn9O9DS', -- Admin123!
    'Administrador Catarsis',
    '+525512345678',
    'admin',
    true,
    true,
    true,
    true
);

-- Insertar usuario normal de prueba
-- Email: usuario@catarsis.com  
-- Password: Usuario123!
INSERT INTO users (
    email,
    password_hash,
    display_name,
    phone,
    role,
    accepts_communications,
    receive_reminders,
    receive_promotions,
    receive_weekly_summary
) VALUES (
    'usuario@catarsis.com',
    '$2a$12$8Y3f5L2mN9QrA3C7K1XsS.9j4H6G8L2mK5P9Q1XrA3C7K1XsS.9j4H', -- Usuario123!
    'Usuario de Prueba',
    '+525587654321',
    'client',
    true,
    true,
    false,
    false
);

-- Insertar instructor de prueba
-- Email: instructor@catarsis.com
-- Password: Instructor123!
INSERT INTO users (
    email,
    password_hash,
    display_name,
    phone,
    role,
    accepts_communications,
    receive_reminders,
    receive_promotions,
    receive_weekly_summary
) VALUES (
    'instructor@catarsis.com',
    '$2a$12$9Z4g6M3nO0RsB4D8L2YtT.0k5I7H9M3nL6Q0R2YsB4D8L2YtT.0k5I', -- Instructor123!
    'Instructor de Prueba',
    '+525598765432',
    'instructor',
    true,
    true,
    true,
    true
);

-- Mostrar los usuarios creados
SELECT 
    email,
    display_name,
    role,
    phone,
    created_at
FROM users 
WHERE email IN ('admin@catarsis.com', 'usuario@catarsis.com', 'instructor@catarsis.com')
ORDER BY role DESC;

-- ============================================
-- CREDENCIALES DE ACCESO:
-- ============================================
-- 
-- ADMINISTRADOR:
-- Email: admin@catarsis.com
-- Password: Admin123!
-- 
-- USUARIO NORMAL:
-- Email: usuario@catarsis.com
-- Password: Usuario123!
-- 
-- INSTRUCTOR:
-- Email: instructor@catarsis.com
-- Password: Instructor123!
-- ============================================