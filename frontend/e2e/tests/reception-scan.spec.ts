import { test, expect } from '../fixtures/auth';

/**
 * Helper — selecciona el primer cliente seed del buscador manual y espera
 * a que la ficha (.ficha) esté visible. Devuelve true si había seed y se
 * abrió la ficha; false en caso contrario (para que el caller haga test.skip).
 */
async function openFirstFicha(page: import('@playwright/test').Page): Promise<boolean> {
    const input = page.getByPlaceholder(/nombre|email|teléfono/i);
    await expect(input).toBeVisible();
    await input.fill('cliente');

    const resultsList = page.locator('.search-results');
    await expect(resultsList).toBeVisible({ timeout: 8000 });

    const firstResult = resultsList.locator('button').first();
    if ((await firstResult.count()) === 0) return false;
    await firstResult.click();
    await expect(page.locator('.ficha')).toBeVisible({ timeout: 8000 });
    return true;
}

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
            // Scoped to .ficha y con ':' para evitar ambigüedad con
            // <CardTitle>Canjear puntos</CardTitle> (strict-mode: /puntos/i match BOTH).
            await expect(page.locator('.ficha').getByText(/puntos:/i)).toBeVisible();
            // Botones de acción (Marcar usado / Canjear) cuando aplique
            await expect(
                page.getByRole('button', { name: /marcar usado|canjear|escanear otro/i }).first()
            ).toBeVisible();
        } else {
            // Sin seed: el test valida que la UI de búsqueda renderiza sin errores.
            test.skip(true, 'sin cliente seed en el entorno para completar el flujo de ficha');
        }
    });

    test('canje: redime una recompensa asequible y aparece en beneficios', async ({ receptionPage: page }) => {
        await page.goto('/reception/scan');
        const hasSeed = await openFirstFicha(page);
        if (!hasSeed) {
            test.skip(true, 'sin cliente seed en el entorno para completar el flujo de canje');
            return;
        }

        // Catálogo de recompensas canjeables (.rewards). Si el cliente seed
        // no tiene puntos suficientes para ninguna recompensa, el contenedor
        // estará vacío — se skipped con razón clara.
        const rewardsList = page.locator('.rewards');
        await expect(rewardsList).toBeVisible({ timeout: 8000 });
        const firstReward = rewardsList.locator('li').first();
        if ((await firstReward.count()) === 0) {
            test.skip(true, 'sin recompensa canjeable para el cliente seed (puntos insuficientes o catálogo vacío)');
            return;
        }

        // Saldo de puntos antes del canje (scoped a .ficha para evitar ambigüedad).
        const pointsBefore = await page.locator('.ficha').getByText(/puntos:/i).textContent();

        // Botón "Canjear" dentro del primer <li> de .rewards (scoped).
        const redeemBtn = firstReward.getByRole('button', { name: /canjear/i });
        await expect(redeemBtn).toBeVisible();
        await redeemBtn.click();

        // Tras el canje: la lista de beneficios (.benefits) debe contener
        // un nuevo beneficio. Esperamos a que aparezca al menos uno.
        const benefitsList = page.locator('.benefits');
        await expect(benefitsList).toBeVisible({ timeout: 8000 });
        await expect(benefitsList.locator('li').first()).toBeVisible({ timeout: 8000 });

        // El saldo de puntos debe haber cambiado (decrementado).
        // Esperamos a que el texto de puntos se actualice.
        await expect.poll(async () => {
            return page.locator('.ficha').getByText(/puntos:/i).textContent();
        }, { timeout: 10_000 }).not.toEqual(pointsBefore);
    });

    test('marcado: marca un beneficio POS como usado y desaparece de vigentes', async ({ receptionPage: page }) => {
        await page.goto('/reception/scan');
        const hasSeed = await openFirstFicha(page);
        if (!hasSeed) {
            test.skip(true, 'sin cliente seed en el entorno para completar el flujo de marcado');
            return;
        }

        // Beneficios vigentes (.benefits). Buscamos un beneficio POS
        // (free_drink/bar_discount/product/product_discount/discount) con
        // botón "Marcar usado" (free_class NO es marcable suelto).
        const benefitsList = page.locator('.benefits');
        await expect(benefitsList).toBeVisible({ timeout: 8000 });

        // Contar beneficios visibles antes del marcado.
        const countBefore = await benefitsList.locator('li').count();

        // Localizar el primer botón "Marcar usado" (sólo beneficios POS marcables lo tienen).
        const markBtn = benefitsList.getByRole('button', { name: /marcar usado/i }).first();
        if ((await markBtn.count()) === 0) {
            test.skip(true, 'sin beneficio POS marcable para el cliente seed (sólo free_class o sin vigentes)');
            return;
        }

        await expect(markBtn).toBeVisible();
        await markBtn.click();

        // Tras marcar: el beneficio usado debe desaparecer de la lista de vigentes.
        // Esperamos a que el conteo de <li> disminuya (de 1+ a countBefore-1).
        await expect.poll(async () => {
            return benefitsList.locator('li').count();
        }, { timeout: 10_000 }).toBeLessThan(countBefore);
    });
});