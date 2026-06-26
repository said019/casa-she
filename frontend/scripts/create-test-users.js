#!/usr/bin/env node

/**
 * Script para crear usuarios de prueba en la base de datos
 * Ejecutar con: node create-test-users.js
 */

import bcrypt from 'bcryptjs';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Configuración de la base de datos
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'balance_room_db',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Usuarios de prueba
const testUsers = [
  {
    email: 'admin@balanceroom.mx',
    password: 'Admin123!',
    displayName: 'Administrador Balance Room',
    phone: '+525512345678',
    role: 'admin',
  },
  {
    email: 'usuario@balanceroom.mx',
    password: 'Usuario123!',
    displayName: 'Usuario de Prueba',
    phone: '+525587654321',
    role: 'client',
  },
  {
    email: 'instructor@balanceroom.mx',
    password: 'Instructor123!',
    displayName: 'Instructor de Prueba',
    phone: '+525598765432',
    role: 'instructor',
  },
];

async function createTestUsers() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Conectando a la base de datos...');
    
    // Eliminar usuarios de prueba existentes
    console.log('🗑️ Eliminando usuarios de prueba existentes...');
    await client.query(
      `DELETE FROM users WHERE email IN ($1, $2, $3)`,
      ['admin@balanceroom.mx', 'usuario@balanceroom.mx', 'instructor@balanceroom.mx']
    );

    // Crear nuevos usuarios
    console.log('👥 Creando usuarios de prueba...');
    
    for (const user of testUsers) {
      // Hash de la contraseña
      const passwordHash = await bcrypt.hash(user.password, 12);
      
      // Insertar usuario
      const result = await client.query(
        `INSERT INTO users (
          email, password_hash, display_name, phone, role,
          accepts_communications, receive_reminders, receive_promotions, receive_weekly_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, email, display_name, role`,
        [
          user.email,
          passwordHash,
          user.displayName,
          user.phone,
          user.role,
          true, // accepts_communications
          true, // receive_reminders
          user.role === 'admin', // receive_promotions (solo admin)
          user.role === 'admin', // receive_weekly_summary (solo admin)
        ]
      );

      console.log(`✅ Usuario creado: ${result.rows[0].display_name} (${result.rows[0].role})`);
    }

    // Mostrar resumen
    console.log('\n📋 CREDENCIALES DE ACCESO:');
    console.log('═══════════════════════════════════════');
    testUsers.forEach(user => {
      console.log(`\n🔑 ${user.displayName.toUpperCase()}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Password: ${user.password}`);
      console.log(`   Rol: ${user.role}`);
    });
    console.log('\n═══════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error creando usuarios de prueba:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar script
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestUsers()
    .then(() => {
      console.log('\n✅ Usuarios de prueba creados exitosamente!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    });
}

export default createTestUsers;