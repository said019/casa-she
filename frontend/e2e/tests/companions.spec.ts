import { test, expect } from '@playwright/test';

for (const count of [1, 2]) {
  test(`promotion confirms ${count} guests atomically and preserves retry identity`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('casashe_token', 'test-token'));
    const requests: { requestId: string; guests: { name: string; phone: string }[] }[] = [];
    let confirmed = false;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = {};
      if (path.endsWith('/auth/me')) data = { user: { id: 'host', role: 'client', display_name: 'Ana' } };
      else if (path.endsWith('/companions/booking/host-booking/promotion')) {
        requests.push(route.request().postDataJSON());
        expect(requests.at(-1)?.guests).toHaveLength(count);
        if (requests.length === 1) return route.fulfill({ status: 503, json: { error: 'database password technical failure' } });
        confirmed = true;
        data = { companions: [] };
      } else if (path.endsWith('/companions/booking/host-booking')) {
        expect(route.request().method()).toBe('GET');
        data = { companions: confirmed ? Array.from({ length: count }, (_, i) => ({ id: `guest-${i}`, guest_name: `Amiga ${i + 1}`, mode: 'promo_free', status: 'confirmed', amount: 0 })) : [], policy: { eligible: !confirmed, mode: 'promo_free', amount: 0, remaining_slots: 2 - (confirmed ? count : 0), promotion: { campaignId: 'october', startDate: '2026-09-28', endDate: '2026-10-31', total: count, remaining: confirmed ? 0 : count, requiredGuests: count, eligible: !confirmed } } };
      } else if (path.endsWith('/bookings/host-booking')) data = { booking_id: 'host-booking', booking_status: 'confirmed', class_date: '2026-10-20', class_start_time: '10:00', class_end_time: '11:00', class_name: 'Pilates' };
      else if (path.endsWith('/cancel-preview')) data = { canCancel: true, willRefund: true };
      await route.fulfill({ json: data });
    });
    await page.goto('/app/classes/host-booking');
    await expect(page.getByText('Promoción de invitadas: del 28 de septiembre al 31 de octubre de 2026')).toBeVisible();
    await page.getByLabel('Nombre invitada 1').fill('Amiga 1');
    await page.getByLabel('Teléfono invitada 1').fill('5512345678');
    const submit = page.getByRole('button', { name: count === 2 ? 'Confirmar dos cortesías' : 'Confirmar cortesía', exact: true });
    if (count === 2) {
      await expect(submit).toBeDisabled();
      await page.getByLabel('Nombre invitada 2').fill('Amiga 2');
      await page.getByLabel('Teléfono invitada 2').fill('55 1234 5678');
      await expect(page.getByText('Cada invitada debe tener un teléfono distinto.')).toBeVisible();
      await expect(submit).toBeDisabled();
      await page.getByLabel('Teléfono invitada 2').fill('5587654321');
    }
    await submit.click();
    await expect(page.getByText('No pudimos confirmar la cortesía. Revisa los datos de las invitadas y los lugares disponibles antes de intentar de nuevo.', { exact: true })).toBeVisible();
    await expect(page.getByText('database password technical failure')).toHaveCount(0);
    await submit.click();
    await expect(page.getByText('Cortesía de promoción', { exact: true })).toHaveCount(count);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    await expect(page.getByRole('link', { name: 'Pagar invitada' })).toHaveCount(0);
  });
}

test('pair promotion with insufficient capacity cannot fall back to payment', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('casashe_token', 'test-token'));
  await page.route('**/api/**', async route => {
    expect(route.request().method()).toBe('GET');
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/auth/me')) data = { user: { id: 'host', role: 'client', display_name: 'Ana' } };
    else if (path.endsWith('/companions/booking/host-booking')) data = { companions: [], policy: { eligible: false, mode: 'promo_free', amount: 0, remaining_slots: 1, promotion: { campaignId: 'october', startDate: '2026-09-28', endDate: '2026-10-31', total: 2, remaining: 2, requiredGuests: 2, eligible: false } } };
    else if (path.endsWith('/bookings/host-booking')) data = { booking_id: 'host-booking', booking_status: 'confirmed', class_date: '2026-10-20', class_start_time: '10:00', class_end_time: '11:00', class_name: 'Pilates' };
    await route.fulfill({ json: data });
  });
  await page.goto('/app/classes/host-booking');
  await expect(page.getByText('No podemos confirmar todas las cortesías en esta clase.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirmar.*cortesía|Agregar invitada para pago/ })).toHaveCount(0);
  await expect(page.getByLabel('Nombre invitada 1')).toHaveCount(0);
});

test('paid companion stays unconfirmed until server validates payment', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('casashe_token', 'test-token'));
  let companions: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/auth/me')) data = { user: { id: 'host', role: 'client', display_name: 'Ana', email: 'ana@example.test' } };
    else if (path.endsWith('/companions/booking/host-booking')) {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toMatchObject({ name: 'María', phone: '5512345678', requestId: expect.any(String) });
        companions = [{ id: 'guest', guest_name: 'María', mode: 'paid', status: 'pending_payment', amount: 280, checkout_url: 'https://www.mercadopago.com.mx/checkout/test' }];
        data = { companion: companions[0] };
      } else data = { companions, policy: { eligible: true, mode: 'paid', amount: 280, remaining_slots: 2 - companions.length } };
    } else if (path.endsWith('/bookings/host-booking')) data = { booking_id: 'host-booking', booking_status: 'confirmed', class_date: '2026-12-20', class_start_time: '10:00', class_end_time: '11:00', class_name: 'Pilates', instructor_name: 'Coach' };
    else if (path.endsWith('/cancel-preview')) data = { canCancel: true, willRefund: true };
    await route.fulfill({ json: data });
  });
  await page.goto('/app/classes/host-booking');
  await page.getByLabel('Nombre de la invitada').fill('María');
  await page.getByLabel('Teléfono de la invitada').fill('5512345678');
  await page.getByRole('button', { name: 'Agregar invitada para pago' }).click();
  await expect(page.getByText('Pendiente de pago', { exact: true })).toBeVisible();
  await expect(page.getByText('Lugar confirmado', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Pagar invitada' })).toHaveAttribute('href', 'https://www.mercadopago.com.mx/checkout/test');
  await expect(page).toHaveURL(/\/app\/classes\/host-booking$/);
});
