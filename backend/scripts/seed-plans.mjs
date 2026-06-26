import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
BEGIN;

-- Eliminar condiciones de inscripción (inscription_conditions / enrollment_conditions)
UPDATE studio_settings SET value = '[]' WHERE key IN ('inscription_conditions', 'enrollment_conditions', 'signup_conditions') AND value IS NOT NULL;
DELETE FROM enrollment_conditions WHERE true;

-- Desactivar todos los planes existentes
UPDATE plans SET is_active = false;

-- Insertar/actualizar los 5 paquetes oficiales
INSERT INTO plans (name, description, price, duration_days, class_limit, is_active, sort_order)
VALUES
  ('Clase suelta',       NULL, 200,  30,  1, true, 1),
  ('Paquete 4 clases',   NULL, 750,  30,  4, true, 2),
  ('Paquete 8 clases',   NULL, 1450, 60,  8, true, 3),
  ('Paquete 12 clases',  NULL, 2100, 60, 12, true, 4),
  ('Paquete 24 clases',  NULL, 2900, 90, 24, true, 5)
ON CONFLICT DO NOTHING;

-- Verificar resultado
SELECT name, price, class_limit, duration_days, is_active FROM plans ORDER BY sort_order, class_limit;

COMMIT;
`;

try {
  const res = await pool.query(SQL);
  // The last SELECT is the last result
  const rows = Array.isArray(res) ? res[res.length - 1].rows : res.rows;
  console.log('Planes activos:');
  console.table(rows);
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}
