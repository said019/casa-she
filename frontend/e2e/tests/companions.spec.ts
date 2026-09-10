import { test, expect } from '@playwright/test';

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
