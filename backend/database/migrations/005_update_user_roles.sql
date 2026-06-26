-- ============================================
-- CATARSIS - Actualización de roles de usuario
-- Migración 005: Agregar roles adicionales
-- ============================================

-- Agregar nuevos valores al enum user_role si no existen
DO $$
BEGIN
    -- Agregar 'super_admin' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'super_admin'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
        ALTER TYPE user_role ADD VALUE 'super_admin';
    END IF;

    -- Agregar 'reception' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'reception'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
        ALTER TYPE user_role ADD VALUE 'reception';
    END IF;
END$$;

-- Agregar comentario explicativo
COMMENT ON TYPE user_role IS 'Roles de usuario: client (cliente), instructor (instructor), admin (administrador), super_admin (super administrador), reception (recepción)';
