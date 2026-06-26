/**
 * 🔥 FIREBASE ADAPTER
 * 
 * Este archivo actúa como un adaptador entre el código de Firebase
 * y el API backend actual. Simula la interfaz de Firebase pero usa
 * el API de Railway por debajo.
 * 
 * NOTA: Este es un adaptador temporal. El sistema de migración fue diseñado
 * para Firebase, pero este proyecto usa un backend API. Este archivo
 * permite que el código compile sin cambiar toda la arquitectura.
 */

import api from './api';

// Simular Timestamp de Firestore
export class Timestamp {
  seconds: number;
  nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now(): Timestamp {
    const now = Date.now();
    return new Timestamp(Math.floor(now / 1000), (now % 1000) * 1000000);
  }

  static fromDate(date: Date): Timestamp {
    const time = date.getTime();
    return new Timestamp(Math.floor(time / 1000), (time % 1000) * 1000000);
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1000000);
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1000000;
  }
}

// Simular funciones serverTimestamp
export const serverTimestamp = () => Timestamp.now();

// Adaptador básico de "db" - usa el API backend
export const db = {
  collection: (path: string) => ({
    doc: (id?: string) => ({
      id: id || `temp_${Date.now()}`,
      set: async (data: any) => {
        // Aquí se haría la llamada al API
        console.warn('[Firebase Adapter] set() llamado pero no implementado completamente');
        return Promise.resolve();
      },
      get: async () => {
        console.warn('[Firebase Adapter] get() llamado pero no implementado completamente');
        return {
          exists: () => false,
          data: () => ({}),
        };
      },
    }),
    get: async () => {
      console.warn('[Firebase Adapter] collection.get() llamado pero no implementado completamente');
      return {
        docs: [],
        size: 0,
      };
    },
  }),
};

// Adaptador de auth - usa el sistema de autenticación actual
export const auth = {
  currentUser: null,
  createUserWithEmailAndPassword: async (email: string, password: string) => {
    console.warn('[Firebase Adapter] createUserWithEmailAndPassword() llamado pero no implementado completamente');
    return Promise.resolve({
      user: {
        uid: `temp_${Date.now()}`,
        email,
      },
    });
  },
};

// Exportar tipos simulados
export type {
  Timestamp as FirebaseTimestamp,
};

// NOTA IMPORTANTE:
// Este archivo es un adaptador temporal. Para implementación completa del
// sistema de migración, se recomienda:
//
// 1. Crear endpoints en el backend API (/api/migrations/*) que manejen:
//    - POST /api/migrations/client - Migrar cliente individual
//    - GET /api/migrations/history - Obtener historial
//    - GET /api/migrations/stats - Estadísticas de membresías
//
// 2. Actualizar los servicios de migración para usar el API directamente
//    en lugar de simular Firebase
//
// 3. O implementar Firebase en el backend si se desea usar Firestore
