/**
 * 🔄 HOOK: Migración de Clientes
 * 
 * Maneja la lógica de migración de clientes existentes
 */

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  migrateExistingClient,
  getMigrationHistory,
  validateMigrationData,
} from '@/services/migrationServiceAPI';
import type {
  MigrateClientParams,
  MigrationResult,
  MigrationRecord,
} from '@/types/migration.types';

export const useMigrateClient = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();

  /**
   * Migrar un cliente individual
   */
  const migrate = async (
    params: MigrateClientParams
  ): Promise<MigrationResult | null> => {
    if (!user) {
      setError('Usuario no autenticado');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Validar datos
      const validationErrors = validateMigrationData(params);
      if (validationErrors.length > 0) {
        setError(validationErrors.join(', '));
        setLoading(false);
        return null;
      }

      // Ejecutar migración
      const result = await migrateExistingClient(
        params,
        user.id,
        user.display_name || 'Admin'
      );

      if (!result.success) {
        setError(result.error || 'Error al migrar cliente');
        return null;
      }

      return result;
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    migrate,
    loading,
    error,
  };
};

/**
 * Hook para historial de migraciones
 */
export const useMigrationHistory = () => {
  const [history, setHistory] = useState<MigrationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (limitCount: number = 50) => {
    setLoading(true);
    setError(null);

    try {
      const records = await getMigrationHistory(limitCount);
      setHistory(records);
    } catch (err: any) {
      setError(err.message || 'Error al cargar historial');
    } finally {
      setLoading(false);
    }
  };

  return {
    history,
    loading,
    error,
    fetchHistory,
  };
};
