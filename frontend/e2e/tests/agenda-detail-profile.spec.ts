import { test, expect } from '@playwright/test';
import { FECHA_PRUEBA, mockSemanaCalendario } from '../fixtures/calendario';

test('detalle legible y acceso al perfil sin alterar el check-in TotalPass', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('casashe_token', 'local-ui-test'));
  await page.route('**/api/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: { id: 'admin-test', role: 'admin', display_name: 'Administración' } } }));
  await mockSemanaCalendario(page);
  await page.route(/\/api\/bookings\/class\//, (route) => route.fulfill({ json: [{
    booking_id: 'booking-test', user_id: 'client-test', display_name: 'Mariana del Valle Montes',
    status: 'checked_in', channel: 'totalpass', totalpass_checkin_confirmed: true,
    phone: '', email: '', photo_url: null, plan_name: null,
  }] }));
  await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
  await page.getByRole('button', { name: /^Barre.*07:00/ }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByText('Check-in validado', { exact: true })).toBeVisible();
  await expect(panel.getByTitle('Marcar asistencia')).toHaveCount(0);
  await expect(panel.getByTitle('Deshacer check-in')).toHaveCount(0);
  const profile = panel.getByRole('link', { name: 'Mariana del Valle Montes Ver perfil', exact: true });
  await expect(profile).toHaveAttribute('href', '/admin/members/client-test');
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await profile.click();
  await expect(page).toHaveURL(/\/admin\/members\/client-test$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
