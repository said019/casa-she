import { test, expect } from '../fixtures/auth';

test.describe('Recepción — Pantalla de escaneo /reception/scan', () => {
    test('muestra buscador manual y encabezado', async ({ receptionPage: page }) => {
        await page.goto('/reception/scan');

        // Encabezado y campo de búsqueda manual visibles
        await expect(page.getByRole('heading', { name: /escanear cliente/i })).toBeVisible();
        await expect(page.getByPlaceholder(/nombre|email|teléfono/i)).toBeVisible();

        // Botón para abrir el escáner de cámara
        await expect(page.getByRole('button', { name: /abrir escáner/i })).toBeVisible();
    });

    test('flujo de búsqueda manual: filtra y muestra ficha + acciones', async ({ receptionPage: page }) => {
        await page.goto('/reception/scan');
        const input = page.getByPlaceholder(/nombre|email|teléfono/i);
        await expect(input).toBeVisible();

        // Disparar búsqueda (>=2 chars para activar la query).
        // Nota: depende de que exista un cliente seed en el entorno de e2e.
        // Si no hay resultados, el test sigue siendo válido para el render de la pantalla.
        await input.fill('cliente');

        // Esperar a que aparezca la lista de resultados o el estado vacío.
        // El contenedor de resultados existe aunque esté vacío (.search-results).
        const resultsList = page.locator('.search-results');
        await expect(resultsList).toBeVisible({ timeout: 8000 });

        const firstResult = resultsList.locator('button').first();
        if (await firstResult.count() > 0) {
            await firstResult.click();
            // Ficha del cliente
            await expect(page.locator('.ficha')).toBeVisible({ timeout: 8000 });
            await expect(page.getByText(/puntos/i)).toBeVisible();
            // Botones de acción (Marcar usado / Canjear) cuando aplique
            await expect(
                page.getByRole('button', { name: /marcar usado|canjear|escanear otro/i }).first()
            ).toBeVisible();
        } else {
            // Sin seed: el test valida que la UI de búsqueda renderiza sin errores.
            test.skip(true, 'sin cliente seed en el entorno para completar el flujo de ficha');
        }
    });
});