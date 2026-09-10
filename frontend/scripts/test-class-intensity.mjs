import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

// Isolated browser tests: actual React components and forms, with an in-memory API.
const server = await createServer({ server: { port: 4197, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', error => console.error(error.message));
  page.setDefaultTimeout(10000);
  await page.route('**/__intensity_test', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="test-root"></div></body></html>' }));
  await page.goto('http://localhost:4197/__intensity_test');
  await page.evaluate(async () => {
    const RefreshRuntime = (await import('/@react-refresh')).default;
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const { React, createRoot } = await import('/scripts/intensity-test-harness.tsx');
    window.testReact = React;
    window.testRoot = createRoot(document.getElementById('test-root'));
    window.intensity = await import('/src/components/classes/ClassIntensity.tsx');
  });
  for (const value of [1, 2, 3, null, undefined, 0, 4, -1, 1.5, '2', NaN]) {
    await page.evaluate(value => window.testRoot.render(window.testReact.createElement(window.intensity.ClassIntensity, { intensity: value })), value);
    const valid = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3;
    await expect(page.locator('[role="img"]')).toHaveCount(valid ? 1 : 0);
    if (valid) {
      await expect(page.getByRole('img', { name: `Intensidad ${value} de 3` })).toHaveText('🔥'.repeat(value));
      await expect(page.locator('[role="img"] > span')).toHaveAttribute('aria-hidden', 'true');
    }
  }
  await page.evaluate(() => {
    const { createElement: h, useState } = window.testReact;
    function Harness() {
      const [value, setValue] = useState(null);
      return h('div', null, h(window.intensity.ClassIntensitySelector, { value, onChange: next => { window.selectedIntensity = next; setValue(next); } }));
    }
    window.testRoot.render(h(Harness));
  });
  for (const value of ['1', '2', '3', '']) {
    await page.getByLabel('Intensidad', { exact: true }).selectOption(value);
    assert.equal(await page.evaluate(() => window.selectedIntensity), value ? Number(value) : null);
  }
  console.log('PASS: actual renderer hides missing/invalid values; accessible flames and controlled selector cover every level and clearing.');

  await page.evaluate(async () => {
    const { QueryClient, QueryClientProvider, MemoryRouter } = await import('/scripts/intensity-test-harness.tsx');
    const api = (await import('/src/lib/api.ts')).default;
    const { useAuthStore } = await import('/src/stores/authStore.ts');
    useAuthStore.setState({ user: { id: 'admin', role: 'admin' }, isAuthenticated: true, isLoading: false });
    const id = '11111111-1111-4111-8111-111111111111';
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    window.requests = [];
    window.fixture = { id, class_type_id: id, instructor_id: id, facility_id: id, date, day_of_week: today.getDay(), start_time: '09:00', end_time: '10:00', max_capacity: 6, current_bookings: 0, class_type_name: 'Pilates prueba', instructor_name: 'Coach prueba', intensity: 2, is_active: true, is_recurring: true, specific_date: null, status: 'scheduled' };
    api.defaults.adapter = async config => {
      let data = [];
      const url = config.url.split('?')[0];
      if (config.method !== 'get') {
        window.requests.push({ method: config.method, url, data: JSON.parse(config.data || '{}') });
        data = { ...window.fixture, ...JSON.parse(config.data || '{}'), creadas: 1 };
      } else if (url === '/schedules' || url === '/classes') data = [window.fixture];
      else if (url === '/class-types') data = [{ id, name: 'Pilates prueba', duration_minutes: 60, max_capacity: 6 }];
      else if (url === '/instructors') data = [{ id, display_name: 'Coach prueba' }];
      else if (url === '/facilities') data = [{ id, name: 'Sede prueba', capacity: 6 }];
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    };
    window.renderForm = async name => {
      const component = name === 'schedule' ? (await import('/src/pages/admin/schedules/WeeklySchedule.tsx')).default : (await import('/src/pages/admin/classes/ClassesCalendar.tsx')).default;
      const h = window.testReact.createElement;
      window.testRoot.render(h(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, h(MemoryRouter, null, h(component, { embedded: true }))));
    };
    await window.renderForm('schedule');
  });
  await page.getByRole('button', { name: 'Editar horario' }).click();
  await expect(page.getByLabel('Intensidad', { exact: true })).toHaveValue('2');
  await page.getByLabel('Intensidad', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Guardar Horario' }).click();
  await expect.poll(() => page.evaluate(() => window.requests.length)).toBe(1);
  const scheduleEdit = await page.evaluate(() => window.requests[0]);
  assert.equal(scheduleEdit.method, 'put');
  assert.match(scheduleEdit.url, /^\/schedules\//);
  assert.equal(scheduleEdit.data.intensity, null);
  assert.equal(scheduleEdit.data.specificDate, null);
  assert.equal(scheduleEdit.data.isRecurring, true);
  assert.equal(scheduleEdit.data.classTypeId, '11111111-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Agregar', exact: true }).first().click();
  await expect(page.getByLabel('Intensidad', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  console.log('PASS: template edit prefills intensity, clears through PUT, and new template resets intensity.');

  await page.evaluate(() => window.renderForm('class'));
  await page.getByRole('button', { name: /^Pilates prueba, Intensidad 2/ }).last().click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.getByLabel('Intensidad', { exact: true })).toHaveValue('2');
  await page.getByLabel('Intensidad', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Guardar Cambios', exact: false }).click();
  await expect.poll(() => page.evaluate(() => window.requests.length)).toBe(2);
  const classEdit = await page.evaluate(() => window.requests[1]);
  assert.equal(classEdit.method, 'put');
  assert.match(classEdit.url, /^\/classes\//);
  assert.equal(classEdit.data.intensity, 3);
  console.log('PASS: session edit prefills intensity and sends numeric intensity only to that session.');

  await page.getByRole('button', { name: 'Nueva clase', exact: true }).click();
  await expect(page.getByLabel('Intensidad', { exact: true })).toHaveValue('');
  await page.getByRole('combobox').filter({ hasText: 'Seleccionar tipo...' }).click();
  await page.getByRole('option', { name: 'Pilates prueba' }).click();
  await page.getByRole('combobox').filter({ hasText: 'Seleccionar instructor...' }).click();
  await page.getByRole('option', { name: 'Coach prueba' }).click();
  await page.getByLabel('Intensidad', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Crear Clase', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.requests.length)).toBe(3);
  const created = await page.evaluate(() => window.requests[2]);
  assert.equal(created.url, '/classes');
  assert.equal(created.data.intensity, 1);
  console.log('PASS: new session starts unset and submits chosen numeric intensity.');

  await page.getByRole('button', { name: 'Nueva clase', exact: true }).click();
  await page.getByRole('combobox').filter({ hasText: 'Seleccionar tipo...' }).click();
  await page.getByRole('option', { name: 'Pilates prueba' }).click();
  await page.getByRole('combobox').filter({ hasText: 'Seleccionar instructor...' }).click();
  await page.getByRole('option', { name: 'Coach prueba' }).click();
  await page.getByLabel('Intensidad', { exact: true }).selectOption('2');
  await page.getByRole('dialog').getByRole('switch').click();
  await page.getByRole('button', { name: 'Seleccionar', exact: true }).click();
  await page.getByRole('button', { name: 'Go to next month' }).click();
  await page.getByRole('gridcell', { name: '15', exact: true }).click();
  await page.getByRole('button', { name: 'Crear clases', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.requests.length)).toBe(4);
  const recurring = await page.evaluate(() => window.requests[3]);
  assert.equal(recurring.url, '/classes/recurring');
  assert.equal(recurring.data.intensity, 2);
  assert.ok(recurring.data.weekdays.length > 0);
  console.log('PASS: recurring creation carries intensity into its dedicated request.');

  await page.evaluate(async () => {
    const { QueryClient, QueryClientProvider, MemoryRouter } = await import('/scripts/intensity-test-harness.tsx');
    const Schedule = (await import('/src/components/Schedule.tsx')).default;
    const h = window.testReact.createElement;
    window.testRoot.render(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(Schedule))));
  });
  await expect(page.getByRole('img', { name: 'Intensidad 2 de 3' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('img', { name: 'Intensidad 2 de 3' })).toBeVisible();
  console.log('PASS: public calendar API mapping renders intensity on desktop and mobile DaySpread.');

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(async () => {
    const { QueryClient, QueryClientProvider, MemoryRouter, Routes, Route } = await import('/scripts/intensity-test-harness.tsx');
    const { default: BioLink, BioSchedule, BioReserve } = await import('/src/pages/BioLink.tsx');
    const CasaSheLanding = (await import('/src/pages/CasaSheLanding.tsx')).default;
    // A future slot remains visible in the active root's public booking flow at any test hour.
    window.fixture.start_time = '23:59';
    const h = window.testReact.createElement;
    window.testRoot.render(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, { key: 'active-root', initialEntries: ['/'] }, h(Routes, null,
      h(Route, { path: '/', element: h(BioLink) }),
      h(Route, { path: '/bio', element: h(BioLink) }),
      h(Route, { path: '/bio/horarios', element: h(BioSchedule) }),
      h(Route, { path: '/bio/reservar', element: h(BioReserve) }),
      h(Route, { path: '/landing', element: h(CasaSheLanding) }),
    ))));
  });
  await expect(page.locator('a[href="/bio/horarios"]')).toBeVisible();
  await page.locator('a[href="/bio/horarios"]').click();
  await expect(page.getByRole('img', { name: 'Intensidad 2 de 3' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('img', { name: 'Intensidad 2 de 3' })).toBeVisible();
  await page.screenshot({ path: '/tmp/casa-she-intensity-bio-mobile.png', fullPage: true });
  await page.getByRole('link', { name: /Volver/ }).click();
  await page.locator('a[href="/bio/reservar"]').click();
  await expect(page.getByRole('img', { name: 'Intensidad 2 de 3' })).toBeVisible();
  await page.getByRole('link', { name: /Volver/ }).click();
  await page.locator('a[href="/landing"]').click();
  await expect(page.getByRole('img', { name: 'Intensidad 2 de 3' }).first()).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Pilates prueba' }).click();
  await expect(page.getByRole('dialog', { name: 'Detalle de Pilates prueba' }).getByRole('img', { name: 'Intensidad 2 de 3' })).toBeVisible();
  console.log('PASS: active root navigation reaches Bio schedule/reserve intensity; /landing preserves API intensity in session card and details.');
} finally {
  await browser.close();
  await server.close();
}
