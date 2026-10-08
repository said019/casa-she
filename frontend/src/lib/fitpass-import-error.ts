export function getFitpassBulkImportLockMessage(error: unknown): string | null {
    const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
    return code === 'FITPASS_SYNC_LOCKED'
        ? 'Fitpass se está sincronizando. Intenta de nuevo en unos segundos.'
        : null;
}
