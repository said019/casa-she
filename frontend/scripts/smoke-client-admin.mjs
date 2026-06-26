#!/usr/bin/env node

import fs from 'node:fs';

const BASE_URL = process.env.API_BASE_URL || 'https://valiant-imagination-production-0462.up.railway.app/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@balanceroom.mx';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const now = Date.now();
const email = `e2e.client.${now}@balanceroom.test`;
const phone = `+52${'55' + String(now).slice(-8)}`;
const password = 'TestClientA1!';
const results = [];

async function req(path, { method = 'GET', token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const t0 = Date.now();
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }

    return {
        ok: response.ok,
        status: response.status,
        data,
        path,
        ms: Date.now() - t0,
    };
}

function record(name, response, expectedSuccess = true) {
    const pass = expectedSuccess ? !!response.ok : !response.ok;
    results.push({
        name,
        pass,
        status: response.status,
        path: response.path,
        ms: response.ms,
        error: pass ? undefined : (response.data?.error || response.data?.message || String(response.data).slice(0, 160)),
    });
}

async function main() {
    const adminLogin = await req('/auth/login', {
        method: 'POST',
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    record('admin.login', adminLogin);
    if (!adminLogin.ok) throw new Error('Admin login failed');

    const adminToken = adminLogin.data.token;

    const register = await req('/auth/register', {
        method: 'POST',
        body: {
            email,
            password,
            displayName: 'E2E Cliente',
            phone,
            acceptsTerms: true,
            acceptsCommunications: true,
        },
    });
    record('client.register', register);

    const clientLogin = await req('/auth/login', {
        method: 'POST',
        body: { email, password },
    });
    record('client.login', clientLogin);
    if (!clientLogin.ok) throw new Error('Client login failed');

    const clientToken = clientLogin.data.token;
    const clientUserId = clientLogin.data.user.id;

    const baseline = [
        ['/classes?start=2026-02-18&end=2026-02-25', 'client.classes.list'],
        ['/bookings/my-bookings', 'client.bookings.my'],
        ['/events?upcoming=true', 'client.events.upcoming'],
        ['/videos/categories', 'client.videos.categories'],
        ['/videos', 'client.videos.list'],
        ['/orders/my-orders', 'client.orders.myOrders'],
        ['/memberships/my', 'client.memberships.my'],
    ];

    for (const [path, name] of baseline) {
        const r = await req(path, { token: clientToken });
        record(name, r);
    }

    const usersSearch = await req(`/users?search=${encodeURIComponent(email)}&limit=5`, { token: adminToken });
    record('admin.users.searchClient', usersSearch);

    const plans = await req('/plans', { token: adminToken });
    record('admin.plans.list', plans);

    let membershipId = null;
    const candidatePlan = Array.isArray(plans.data)
        ? plans.data.find((p) => p.is_active && p.class_limit !== null && Number(p.class_limit) > 0)
        : null;

    if (candidatePlan) {
        const assign = await req('/memberships/assign', {
            method: 'POST',
            token: adminToken,
            body: {
                userId: clientUserId,
                planId: candidatePlan.id,
                status: 'active',
                paymentMethod: 'cash',
                notes: 'e2e smoke',
            },
        });
        record('admin.memberships.assign', assign);
        if (assign.ok) membershipId = assign.data.id;
    }

    const membershipsAfterAssign = await req('/memberships/my', { token: clientToken });
    record('client.memberships.afterAssign', membershipsAfterAssign);

    const classes = await req('/classes?start=2026-02-18&end=2026-02-25', { token: clientToken });
    if (classes.ok && Array.isArray(classes.data) && classes.data.length > 0) {
        const classId = (classes.data.find((c) => c.status === 'scheduled') || classes.data[0]).id;
        const booking = await req('/bookings', {
            method: 'POST',
            token: clientToken,
            body: {
                classId,
                membershipId: membershipId || undefined,
            },
        });
        record('client.bookings.create', booking);
    }

    const adminBookings = await req(`/bookings?search=${encodeURIComponent(email)}`, { token: adminToken });
    record('admin.bookings.searchClient', adminBookings);

    let upcoming = await req('/events?upcoming=true', { token: clientToken });
    record('client.events.refresh', upcoming);

    if (upcoming.ok && Array.isArray(upcoming.data) && upcoming.data.length === 0) {
        const instructors = await req('/instructors?all=true', { token: adminToken });
        record('admin.instructors.list', instructors);

        const instructorName = (Array.isArray(instructors.data) && instructors.data[0]?.display_name) || 'Staff';
        const createEvent = await req('/events', {
            method: 'POST',
            token: adminToken,
            body: {
                type: 'workshop',
                title: `E2E Evento ${now}`,
                description: 'Evento de prueba para smoke test',
                instructor_name: instructorName,
                date: '2026-12-15',
                start_time: '10:00',
                end_time: '11:00',
                location: 'Studio A',
                capacity: 20,
                price: 0,
                member_discount: 0,
                requirements: '',
                includes: [],
                tags: [],
                status: 'published',
            },
        });
        record('admin.events.create', createEvent);

        upcoming = await req('/events?upcoming=true', { token: clientToken });
        record('client.events.refresh.afterCreate', upcoming);
    }

    if (upcoming.ok && Array.isArray(upcoming.data) && upcoming.data.length > 0) {
        const eventId = upcoming.data[0].id;

        const registerEvent = await req(`/events/${eventId}/register`, {
            method: 'POST',
            token: clientToken,
            body: {
                name: 'E2E Cliente',
                email,
                phone,
                payment_method: 'transfer',
            },
        });
        record('client.events.register', registerEvent);

        const adminEvents = await req('/events/admin/all', { token: adminToken });
        record('admin.events.listAll', adminEvents);

        const cancelEvent = await req(`/events/${eventId}/register`, {
            method: 'DELETE',
            token: clientToken,
        });
        record('client.events.cancel', cancelEvent);
    }

    const videoUploadProbe = await fetch(`${BASE_URL}/videos/upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${adminToken}`,
        },
        body: new FormData(),
    });
    const probeText = await videoUploadProbe.text();
    let probeData;
    try {
        probeData = JSON.parse(probeText);
    } catch {
        probeData = probeText;
    }
    const uploadRouteAvailable = videoUploadProbe.status !== 404;
    record('admin.videos.upload.endpoint', {
        ok: uploadRouteAvailable,
        status: videoUploadProbe.status,
        data: probeData,
        path: '/videos/upload',
        ms: 0,
    });

    const categories = await req('/videos/categories', { token: adminToken });
    record('admin.videos.categories', categories);

    if (categories.ok && Array.isArray(categories.data) && categories.data[0]) {
        const createVideo = await req('/videos', {
            method: 'POST',
            token: adminToken,
            body: {
                title: `E2E Video ${now}`,
                description: 'Video de prueba e2e',
                cloudinary_id: 'balance-room/videos/test/e2e-sample',
                drive_file_id: 'balance-room/videos/test/e2e-sample',
                category_id: categories.data[0].id,
                level: 'todos',
                access_type: 'gratuito',
                is_published: false,
                duration_seconds: 30,
                sales_enabled: true,
                sales_price_mxn: 399,
                sales_class_credits: 5,
                sales_cta_text: 'Comprar clases',
            },
        });
        record('admin.videos.create.withSalesPrice', createVideo);
    }

    const summary = {
        total: results.length,
        passed: results.filter((r) => r.pass).length,
        failed: results.filter((r) => !r.pass).length,
    };

    const report = {
        base: BASE_URL,
        email,
        phone,
        summary,
        results,
    };

    const reportPath = process.env.SMOKE_REPORT_PATH || '/tmp/client_admin_smoke.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(JSON.stringify(summary, null, 2));
    console.log(`Report: ${reportPath}`);

    if (summary.failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
