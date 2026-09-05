import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

async function freePort() {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
}
function treeRss(pid) {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' })
        .trim().split('\n').map((row) => row.trim().split(/\s+/).map(Number));
    const ids = new Set([pid]);
    for (let i = 0; i < rows.length; i++) {
        for (const [id, parent] of rows) if (ids.has(parent)) ids.add(id);
    }
    return rows.filter(([id]) => ids.has(id)).reduce((sum, [, , rss]) => sum + rss, 0);
}
const assets = await readdir('dist/assets');
const asset = assets.find((name) => name.endsWith('.js'));
assert.ok(asset, 'Build the frontend before running this check');
const config = JSON.parse(await readFile('railway.json', 'utf8'));
const expected = 'node node_modules/serve/build/main.js dist -s -p ${PORT:-8080}';
assert.equal(config.deploy.startCommand, expected);
assert.ok((await readFile('nixpacks.toml', 'utf8')).includes(expected));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(pkg.scripts.start, 'exec ' + expected);
const probes = [
    ['/', {}],
    ['/admin/schedules', {}],
    ['/login', {}],
    ['/assets/' + asset, {}],
    ['/assets/' + asset, { method: 'HEAD' }],
    ['/assets/' + asset, { headers: { Range: 'bytes=0-99' } }],
    ['/missing-file.js', {}],
];
async function inspect(label, command) {
    const port = await freePort();
    const child = spawn('/bin/sh', ['-c', command], {
        detached: true,
        env: { ...process.env, PORT: String(port), NO_UPDATE_CHECK: '1' },
        stdio: 'ignore',
    });
    const exited = new Promise((resolve) => child.once('exit', resolve));
    try {
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            if (child.exitCode !== null) throw new Error(label + ' exited before readiness');
            try {
                const response = await fetch('http://127.0.0.1:' + port);
                await response.arrayBuffer();
                ready = response.ok;
                if (ready) break;
            } catch {}
            await delay(100);
        }
        assert.ok(ready, label + ' must become ready');
        const responses = [];
        for (const [route, init] of probes) {
            const response = await fetch('http://127.0.0.1:' + port + route, init);
            const body = Buffer.from(await response.arrayBuffer());
            responses.push({
                status: response.status,
                type: response.headers.get('content-type'),
                cache: response.headers.get('cache-control'),
                hash: createHash('sha256').update(body).digest('hex'),
            });
        }
        await delay(500);
        return { responses, rssKiB: treeRss(child.pid) };
    } finally {
        try { process.kill(-child.pid, 'SIGTERM'); } catch {}
        const stopped = await Promise.race([exited.then(() => true), delay(2000).then(() => false)]);
        if (!stopped) {
            try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        }
    }
}
const previous = await inspect('previous npx entrypoint', 'npx serve dist -s -p ${PORT:-8080}');
const direct = await inspect('direct entrypoint', config.deploy.startCommand);
const npmFallback = await inspect('npm start compatibility', 'npm run start');
assert.deepEqual(direct.responses, previous.responses);
assert.deepEqual(npmFallback.responses, previous.responses);
assert.equal(direct.responses[0].status, 200);
assert.equal(direct.responses[5].status, 206);
console.log(JSON.stringify({
    result: 'PASS',
    equivalentRequestsPerEntrypoint: probes.length,
    localRssKiB: { previousNpx: previous.rssKiB, direct: direct.rssKiB, npmFallback: npmFallback.rssKiB },
    note: 'Local RSS sample, not a production savings measurement',
}, null, 2));
