import { test, expect } from '../fixtures/auth';

test.describe('Recepción — CRM de cliente', () => {
    test('agregar una etiqueta y una nota persiste el flujo', async ({ receptionPage: page }) => {
        await page.goto('/reception/clientes');
        const firstClient = page.locator('[data-testid="client-row"]').first();
        if (await firstClient.count() === 0) test.skip(true, 'sin clientes en el entorno');
        await firstClient.click();

        // Etiqueta
        await page.getByRole('button', { name: /agregar/i }).click();
        await page.getByRole('button', { name: /^VIP$/ }).click();
        await page.keyboard.press('Escape'); // cerrar el popover
        // El chip real tiene title="Quitar etiqueta"
        await expect(page.locator('[title="Quitar etiqueta"]', { hasText: 'VIP' })).toBeVisible();

        // Nota
        await page.getByPlaceholder(/notas internas/i).fill('Nota de prueba E2E');
        await page.getByRole('button', { name: /^Guardar$/ }).click();
        await expect(page.getByText(/notas guardadas/i)).toBeVisible();
    });
});
