import { test, expect, type Page } from '@playwright/test';
import { FECHA_PRUEBA, ID, mockSemanaCalendario } from '../fixtures/calendario';

const UID = '00000000-0000-4000-8000-00000000aa01';
const MID = '00000000-0000-4000-8000-00000000bb01';
const PID = '00000000-0000-4000-8000-00000000cc01';
const NEW = '00000000-0000-4000-8000-00000000aa02';

async function setup(page: Page, options: { stale?: boolean; duplicate?: boolean; full?: boolean; unlimited?: boolean; role?: string } = {}) {
    const state = {
        creates: 0, assignments: [] as any[], adjustments: [] as any[], dates: [] as any[], bookings: [] as any[],
        members: [{ id: MID, user_id: UID, plan_id: PID, plan_name: 'Paquete 8', status: 'active', start_date: '2026-10-01', end_date: '2026-11-30', payment_date: '2026-09-30', reformer_remaining: 0, multi_remaining: options.unlimited ? null : 4, classes_remaining: options.unlimited ? null : 4 }],
        attendees: [] as any[],
    };
    const attendee = (id = UID, name = 'Ana Prueba') => ({
        booking_id: `booking-${id}`, user_id: id, display_name: name, status: 'confirmed', channel: 'app',
        phone: '5512345678', email: 'ana@example.test', photo_url: null, plan_name: 'Paquete 8', membership_id: MID,
        membership_summary: { membership_id: MID, owner_id: UID, plan_name: options.unlimited ? 'Mensual ilimitado' : 'Paquete 8', status: 'active', start_date: '2026-10-01', end_date: '2026-11-30', attended: 3, reserved: 1, reformer_remaining: 0, multi_remaining: state.members[0].multi_remaining },
    });
    state.attendees = [attendee(), { booking_id: 'external', user_id: 'external-user', display_name: 'Socia TotalPass', status: 'checked_in', channel: 'totalpass', totalpass_checkin_confirmed: true, membership_summary: null, plan_name: null }];
    await page.addInitScript(() => localStorage.setItem('casashe_token', 'local-ui-test'));
    await page.route('**/api/**', route => route.fulfill({ json: [] }));
    await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'admin-test', role: options.role ?? 'admin', display_name: 'Administración', permissions: { clientes: true, vender: true, reservas: true } } } }));
    await mockSemanaCalendario(page);
    await page.route(/\/api\/bookings\/class\//, route => route.fulfill({ json: state.attendees.map(a => a.user_id === UID ? attendee() : a) }));
    await page.route(/\/api\/plans(?:\?|$)/, route => route.fulfill({ json: [{ id: PID, name: 'Paquete 8', price: 1600, currency: 'MXN', duration_days: 30, class_limit: 8, reformer_credits: 0, multi_credits: 8, is_active: true }] }));
    await page.route(/\/api\/memberships\?/, route => {
        const userId = new URL(route.request().url()).searchParams.get('userId');
        return route.fulfill({ json: state.members.filter(m => m.user_id === userId) });
    });
    await page.route('**/api/memberships/assign', async route => {
        const body = route.request().postDataJSON(); state.assignments.push(body);
        const member = { id: 'new-membership', user_id: body.userId, plan_id: body.planId, plan_name: 'Paquete 8', status: 'active', start_date: body.startDate, end_date: body.endDate, payment_date: body.paymentDate, reformer_remaining: 0, multi_remaining: 8, classes_remaining: 8 };
        state.members.push(member);
        await route.fulfill({ status: 201, json: member });
    });
    await page.route(/\/api\/memberships\/[^/]+\/credits$/, async route => {
        const body = route.request().postDataJSON(); state.adjustments.push(body);
        const id = new URL(route.request().url()).pathname.split('/').at(-2);
        const member = state.members.find(m => m.id === id)!;
        if (options.stale) {
            member.multi_remaining = 3;
            return route.fulfill({ status: 409, json: { code: 'CREDITS_CHANGED', error: 'El saldo cambió. Actualiza la membresía antes de guardar.' } });
        }
        if (body.multi_remaining !== undefined) member.multi_remaining = body.multi_remaining;
        if (body.reformer_remaining !== undefined) member.reformer_remaining = body.reformer_remaining;
        await route.fulfill({ json: member });
    });
    await page.route(/\/api\/memberships\/[^/]+\/dates$/, async route => {
        const body = route.request().postDataJSON(); state.dates.push(body);
        const member = state.members[0]; member.start_date = body.startDate; member.end_date = body.endDate;
        await route.fulfill({ json: member });
    });
    await page.route('**/api/users', async route => {
        if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
        state.creates++;
        if (options.duplicate) return route.fulfill({ status: 409, json: { code: 'YA_EXISTE', error: 'Esta alumna ya está registrada', existingUser: { id: UID, display_name: 'Ana Prueba' } } });
        await route.fulfill({ status: 201, json: { id: NEW, display_name: 'Laura Nueva', email: 'laura@example.test', phone: '5512345670', role: 'client' } });
    });
    await page.route('**/api/bookings/admin-book', async route => {
        const body = route.request().postDataJSON(); state.bookings.push(body);
        if (options.full) return route.fulfill({ status: 409, json: { error: 'La clase está llena' } });
        state.attendees.push(attendee(body.userId, 'Laura Nueva'));
        await route.fulfill({ status: 201, json: { id: 'new-booking', user_id: body.userId, class_id: ID.barre, status: 'confirmed' } });
    });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    await page.getByRole('button', { name: /^Barre.*07:00/ }).click();
    return state;
}

test('consumo junto al nombre y check-in externo sin saldo ficticio', async ({ page }) => {
    await setup(page);
    await expect(page.getByText(/3 asistidas/)).toBeVisible();
    await expect(page.getByText(/1 reservada/)).toBeVisible();
    await expect(page.getByText(/4 disponibles/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gestionar membresía de Ana Prueba' })).toBeVisible();
    await expect(page.getByText('Check-in validado', { exact: true })).toBeVisible();
    await expect(page.getByTitle('Deshacer check-in')).toHaveCount(0);
    const panel = page.getByRole('dialog').first();
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('asignación permite fecha real de pago y vigencia manual sin salir de agenda', async ({ page }) => {
    const state = await setup(page);
    await page.getByRole('button', { name: 'Gestionar membresía de Ana Prueba' }).click();
    await page.getByRole('button', { name: 'Asignar nuevo plan' }).click();
    const sale = page.getByRole('dialog', { name: 'Vender / asignar plan' });
    await page.getByLabel('Plan', { exact: true }).click();
    await page.getByRole('option', { name: /Paquete 8/ }).click();
    await sale.getByLabel('Inicio de vigencia', { exact: true }).fill('2026-10-01');
    await sale.getByLabel('Fin de vigencia', { exact: true }).fill('2026-11-12');
    await sale.getByLabel('Fecha de pago', { exact: true }).fill('2026-09-30');
    await expect(page.getByRole('button', { name: 'Asignar Plan', exact: true })).toBeDisabled();
    await page.getByLabel('Confirmo que el pago ya fue recibido').check();
    await page.getByRole('button', { name: 'Asignar Plan', exact: true }).click();
    await expect.poll(() => state.assignments.length).toBe(1);
    expect(state.assignments[0]).toMatchObject({ userId: UID, planId: PID, startDate: '2026-10-01', endDate: '2026-11-12', paymentDate: '2026-09-30', respectExplicitDates: true, status: 'active' });
    expect(state.assignments[0].idempotencyKey).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    await expect(page).toHaveURL(/\/admin\/calendar\?date=2026-11-04/);
    await page.screenshot({ path: `/private/tmp/casa-calendar-membership-${test.info().project.name}.png`, fullPage: true });
});

test('ajustar saldo conserva motivo y comparación contra saldo visto', async ({ page }) => {
    const state = await setup(page);
    await page.getByRole('button', { name: 'Gestionar membresía de Ana Prueba' }).click();
    await page.getByRole('button', { name: 'Ajustar créditos', exact: true }).click();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Clases', exact: true }).click();
    await dialog.getByRole('spinbutton').fill('-2');
    await expect(dialog.getByRole('button', { name: 'Aplicar', exact: true })).toBeDisabled();
    await dialog.getByLabel('Motivo (mínimo 5 caracteres)').fill('Clases consumidas antes del registro');
    await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await expect.poll(() => state.adjustments.length).toBe(1);
    expect(state.adjustments[0]).toMatchObject({ multi_remaining: 2, expected_multi_remaining: 4, reason: 'Clases consumidas antes del registro' });
    await expect(page.getByText('Salsa: 0 · Clases: 2')).toBeVisible();
});

test('conflicto de saldo recarga sin aplicar automáticamente otra modificación', async ({ page }) => {
    const state = await setup(page, { stale: true });
    await page.getByRole('button', { name: 'Gestionar membresía de Ana Prueba' }).click();
    await page.getByRole('button', { name: 'Ajustar créditos', exact: true }).click();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Clases', exact: true }).click();
    await dialog.getByRole('spinbutton').fill('-1');
    await dialog.getByLabel('Motivo (mínimo 5 caracteres)').fill('Corrección de saldo');
    await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('El saldo cambió');
    await expect(dialog.getByRole('button', { name: 'Aplicar', exact: true })).toBeDisabled();
    expect(state.adjustments).toHaveLength(1);
});

test('editar vigencia existente conserva motivo y membresía asociada', async ({ page }) => {
    const state = await setup(page);
    await page.getByRole('button', { name: 'Gestionar membresía de Ana Prueba' }).click();
    await expect(page.getByLabel('Membresía a gestionar')).toHaveValue(MID);
    await page.getByLabel('Fin de vigencia').fill('2026-12-04');
    await page.getByLabel('Motivo del cambio de fechas').fill('Vigencia acordada al pagar');
    await page.getByRole('button', { name: 'Guardar fechas', exact: true }).click();
    await expect.poll(() => state.dates.length).toBe(1);
    expect(state.dates[0]).toMatchObject({ startDate: '2026-10-01', endDate: '2026-12-04', reason: 'Vigencia acordada al pagar' });
    await expect(page.getByText('Fechas actualizadas.', { exact: true })).toBeVisible();
});

async function register(page: Page) {
    await page.getByRole('button', { name: 'Registrar cliente', exact: true }).click();
    await page.getByLabel('Nombre completo', { exact: true }).fill('Laura Nueva');
    await page.getByLabel('Correo', { exact: true }).fill('laura@example.test');
    await page.getByLabel('WhatsApp', { exact: true }).fill('5512345670');
    await page.getByRole('button', { name: 'Crear cliente', exact: true }).click();
}

test('registro independiente conserva cliente si no se puede reservar', async ({ page }) => {
    const state = await setup(page, { full: true });
    await register(page);
    await expect(page.getByRole('heading', { name: 'Membresías de Laura Nueva' })).toBeVisible();
    await expect(page.getByText('Sin membresías registradas.')).toBeVisible();
    await page.getByRole('button', { name: 'Reservar en esta clase', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('El cliente sigue registrado');
    await expect(page.getByRole('alert')).toContainText('La clase está llena');
    await expect(page.getByText('Reserva pendiente', { exact: true })).toBeVisible();
    expect(state.creates).toBe(1);
    expect(state.assignments).toHaveLength(0);
    await page.getByRole('button', { name: 'Reservar en esta clase', exact: true }).click();
    await expect.poll(() => state.bookings.length).toBe(2);
    expect(state.creates).toBe(1);
});

test('cliente duplicado se gestiona sin volver a crearlo ni salir de agenda', async ({ page }) => {
    const state = await setup(page, { duplicate: true });
    await register(page);
    await expect(page.getByRole('heading', { name: 'Membresías de Ana Prueba' })).toBeVisible();
    expect(state.creates).toBe(1);
    await expect(page.getByLabel('Membresía a gestionar')).toHaveValue('');
    await page.getByLabel('Membresía a gestionar').selectOption(MID);
    await expect(page.getByText('Fecha de pago: 2026-09-30')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/calendar\?date=2026-11-04/);
});

test('flujo completo registra, asigna con fechas, ajusta y reserva sin repetir alta', async ({ page }) => {
    const state = await setup(page);
    await register(page);
    await page.getByRole('button', { name: 'Asignar nuevo plan' }).click();
    await page.getByLabel('Plan', { exact: true }).click();
    await page.getByRole('option', { name: /Paquete 8/ }).click();
    await page.getByLabel('Inicio de vigencia').fill('2026-10-01');
    await page.getByLabel('Fin de vigencia').fill('2026-11-12');
    await page.getByLabel('Fecha de pago').fill('2026-09-30');
    await page.getByLabel('Confirmo que el pago ya fue recibido').check();
    await page.getByRole('button', { name: 'Asignar Plan', exact: true }).click();
    await page.getByLabel('Membresía a gestionar').selectOption('new-membership');
    await page.getByRole('button', { name: 'Ajustar créditos', exact: true }).click();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Clases', exact: true }).click();
    await dialog.getByRole('spinbutton').fill('-3');
    await dialog.getByLabel('Motivo (mínimo 5 caracteres)').fill('Tres clases previas al registro');
    await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await expect(page.getByText('Salsa: 0 · Clases: 5')).toBeVisible();
    await page.getByRole('button', { name: 'Reservar en esta clase', exact: true }).click();
    await expect(page.getByText('Reserva confirmada', { exact: true })).toBeVisible();
    expect(state.creates).toBe(1);
    expect(state.assignments).toHaveLength(1);
    expect(state.adjustments).toHaveLength(1);
    expect(state.bookings).toEqual([{ userId: NEW, classId: ID.barre, free: false }]);
});

test('resumen conserva categoría agotada y ajuste no ofrece categorías deshabilitadas', async ({ page }) => {
    const state = await setup(page);
    await page.route(/\/api\/bookings\/class\//, route => route.fulfill({ json: [{
        ...state.attendees[0],
        membership_summary: { ...state.attendees[0].membership_summary, reformer_credits: 4, multi_credits: 8, reformer_remaining: 0, multi_remaining: 4 },
    }] }));
    await page.reload();
    await page.getByRole('button', { name: /^Barre.*07:00/ }).click();
    await expect(page.getByTestId('resumen-membresia')).toContainText('Salsa: 0 disponibles · Clases: 4 disponibles');
});

test('plan ilimitado no ofrece ajuste finito de una categoría deshabilitada', async ({ page }) => {
    const state = await setup(page, { unlimited: true });
    await page.route(/\/api\/memberships\?/, route => route.fulfill({ json: state.members.map(m => ({ ...m, reformer_credits: 0, multi_credits: null })) }));
    await page.getByRole('button', { name: 'Gestionar membresía de Ana Prueba' }).click();
    await page.getByRole('button', { name: 'Ajustar créditos', exact: true }).click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog.getByText('Este plan es ilimitado; no tiene créditos finitos para ajustar.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Aplicar', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('spinbutton')).toBeDisabled();
    await dialog.getByRole('combobox').click();
    await expect(page.getByRole('option', { name: 'Salsa', exact: true })).toHaveCount(0);
});
