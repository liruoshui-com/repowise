import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createApp, configuration } from '../server/app.js';
import { loadCatalog, matchProjects } from '../server/content.js';
import { deliver } from '../server/mail.js';

const prefs = { topics: ['knowledge'], language: 'both', deployment: 'any' };
const adminToken = 'a-test-only-admin-secret-32-characters-long';
async function fixture(t, overrides = {}, fetchImpl) {
  const dir = mkdtempSync(join(tmpdir(), 'repowise-test-'));
  const config = { ...configuration({ DATA_DIR: dir, ADMIN_TOKEN: adminToken }), ...overrides };
  const app = createApp(config, { fetchImpl });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  config.baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise(resolve => app.server.close(resolve));
    app.db.close(); rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, method = 'GET', body, token = '', headers = {}) {
    const response = await fetch(config.baseUrl + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  async function signup(email = 'builder@example.com', preferences = prefs) {
    const result = await request('/api/subscribe', 'POST', { email, preferences, consent: true });
    assert.equal(result.status, 202);
    const mail = app.db.prepare("SELECT * FROM outbox WHERE recipient=? AND kind='confirm' ORDER BY created_at DESC").get(email);
    return mail?.text.match(/\/confirm#([\w-]+)/)?.[1];
  }
  async function activate(email = 'builder@example.com', preferences = prefs) {
    const confirmation = await signup(email, preferences);
    const result = await request('/api/confirm', 'POST', { token: confirmation });
    assert.equal(result.status, 200); return result.data.token;
  }
  return { ...app, request, signup, activate, config };
}

test('subscription requires consent and confirmation; tokens are hashed and one-use', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/subscribe', 'POST', { email: 'builder@example.com', preferences: prefs })).status, 400);
  assert.equal((await f.request('/api/subscribe', 'POST', { email: 'invalid', preferences: prefs, consent: true })).status, 400);
  const confirmation = await f.signup();
  assert.equal(f.db.prepare('SELECT status FROM subscribers').get().status, 'pending');
  assert.notEqual(f.db.prepare('SELECT hash FROM tokens').get().hash, confirmation);
  assert.equal((await f.request('/api/me', 'GET', undefined, confirmation)).status, 401);
  const confirmed = await f.request('/api/confirm', 'POST', { token: confirmation });
  assert.equal(confirmed.status, 200);
  assert.equal((await f.request('/api/confirm', 'POST', { token: confirmation })).status, 400);
  const profile = await f.request('/api/me', 'GET', undefined, confirmed.data.token);
  assert.deepEqual(profile.data.preferences, prefs);
});

test('an unauthenticated signup cannot overwrite active preferences or resubscribe without confirmation', async t => {
  const f = await fixture(t); const token = await f.activate();
  const changed = { topics: ['agents'], language: 'python', deployment: 'selfhost' };
  f.db.prepare('UPDATE subscribers SET last_request=0').run();
  await f.request('/api/subscribe', 'POST', { email: 'builder@example.com', preferences: changed, consent: true });
  assert.deepEqual((await f.request('/api/me', 'GET', undefined, token)).data.preferences, prefs);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind='manage'").get().n, 1);
  await f.request('/api/unsubscribe', 'POST', {}, token);
  f.db.prepare('UPDATE subscribers SET last_request=0').run();
  const confirmation = await f.signup('builder@example.com', changed);
  assert.equal(f.db.prepare('SELECT status FROM subscribers').get().status, 'unsubscribed');
  const confirmationResult = await f.request('/api/confirm', 'POST', { token: confirmation });
  assert.deepEqual((await f.request('/api/me', 'GET', undefined, confirmationResult.data.token)).data.preferences, changed);
});

test('expired tokens, cross-origin requests and unauthenticated admin actions fail closed', async t => {
  const f = await fixture(t); const confirmation = await f.signup();
  f.db.prepare('UPDATE tokens SET expires_at=0').run();
  assert.equal((await f.request('/api/confirm', 'POST', { token: confirmation })).status, 400);
  assert.equal((await f.request('/api/admin/stats')).status, 401);
  assert.equal((await f.request('/api/admin/approve', 'POST', { issueId: '001' })).status, 401);
  assert.equal((await f.request('/api/subscribe', 'POST', { email: 'x@example.com', preferences: prefs, consent: true }, '', { Origin: 'https://evil.example' })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(`${f.config.baseUrl}/api/dev/mail`, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(reboundStatus, 404);
  const result = await fetch(`${f.config.baseUrl}/.env`);
  assert.equal(result.status, 404);
});

test('preferences, follows and feedback persist; feedback is updated rather than inflated', async t => {
  const f = await fixture(t); const token = await f.activate();
  const updated = { topics: ['shipping'], language: 'typescript', deployment: 'cloud' };
  assert.equal((await f.request('/api/me', 'PATCH', { preferences: updated }, token)).status, 200);
  assert.equal((await f.request('/api/feedback', 'POST', { projectId: 'not-real', value: 'used' }, token)).status, 400);
  await f.request('/api/follow', 'POST', { projectId: 'docling', follow: true }, token);
  await f.request('/api/feedback', 'POST', { projectId: 'docling', value: 'try' }, token);
  await f.request('/api/feedback', 'POST', { projectId: 'docling', value: 'used' }, token);
  const me = (await f.request('/api/me', 'GET', undefined, token)).data;
  assert.deepEqual(me.preferences, updated); assert.deepEqual(me.follows, ['docling']); assert.equal(me.feedback.docling, 'used');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM feedback').get().n, 1);
  await f.request('/api/follow', 'POST', { projectId: 'docling', follow: false }, token);
  assert.deepEqual((await f.request('/api/me', 'GET', undefined, token)).data.follows, []);
});

test('digest requires approval, skips unconfirmed/unmatched subscribers and is idempotent', async t => {
  const f = await fixture(t); const token = await f.activate();
  await f.signup('pending@example.com');
  await f.activate('unmatched@example.com', { topics: ['agents'], language: 'typescript', deployment: 'cloud' });
  assert.equal((await f.request('/api/admin/send', 'POST', { issueId: '001' }, adminToken)).status, 400);
  await f.request('/api/admin/approve', 'POST', { issueId: '001' }, adminToken);
  const result = await f.request('/api/admin/send', 'POST', { issueId: '001' }, adminToken);
  assert.equal(result.data.queued, 1);
  const mail = f.db.prepare("SELECT * FROM outbox WHERE kind='digest'").get();
  assert.equal(mail.status, 'preview'); assert.match(mail.text, /Docling/); assert.match(mail.text, /管理偏好或退订/);
  assert.equal((await f.request('/api/admin/send', 'POST', { issueId: '001' }, adminToken)).data.queued, 0);
  await f.request('/api/unsubscribe', 'POST', {}, token);
  assert.equal((await f.request('/api/me', 'GET', undefined, token)).status, 401);
  const mailToken = mail.text.match(/\/manage#([\w-]+)/)[1];
  assert.equal((await f.request('/api/me', 'GET', undefined, mailToken)).status, 401);
});

test('editing approved content requires a new editorial approval', async t => {
  const f = await fixture(t);
  await f.activate();
  await f.request('/api/admin/approve', 'POST', { issueId: '001' }, adminToken);
  f.catalog.projects[0].summary += ' edited';
  assert.equal((await f.request('/api/admin/send', 'POST', { issueId: '001' }, adminToken)).status, 400);
  assert.deepEqual((await f.request('/api/admin/stats', 'GET', undefined, adminToken)).data.publications, []);
  await f.request('/api/admin/approve', 'POST', { issueId: '001' }, adminToken);
  assert.equal((await f.request('/api/admin/send', 'POST', { issueId: '001' }, adminToken)).status, 200);
});

test('account deletion cascades through private data', async t => {
  const f = await fixture(t); const token = await f.activate();
  await f.request('/api/follow', 'POST', { projectId: 'ragas', follow: true }, token);
  await f.request('/api/feedback', 'POST', { projectId: 'ragas', value: 'used' }, token);
  assert.equal((await f.request('/api/me', 'DELETE', {}, token)).status, 200);
  for (const table of ['subscribers', 'tokens', 'outbox', 'feedback', 'follows']) assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
});

test('mail provider failures are recorded and retry reuses the same idempotency key', async t => {
  const requests = []; let fail = true;
  const f = await fixture(t, { mailMode: 'resend', resendKey: 'test-key', mailFrom: 'test@example.com' }, async (url, options) => {
    requests.push(options); return { ok: !fail, status: fail ? 503 : 200 };
  });
  const confirmation = await f.signup(); assert.ok(confirmation);
  let mail = f.db.prepare('SELECT * FROM outbox').get(); assert.equal(mail.status, 'failed');
  fail = false;
  assert.equal((await f.request('/api/admin/retry', 'POST', { id: mail.id }, adminToken)).status, 200);
  mail = f.db.prepare('SELECT * FROM outbox').get(); assert.equal(mail.status, 'sent');
  assert.equal(requests.length, 2); assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key']);
  assert.equal((await f.request('/api/dev/mail')).status, 404);
  assert.equal((await f.request('/api/admin/retry', 'POST', { id: mail.id }, adminToken)).status, 400);
});

test('cancelled recipients are rechecked at delivery and old failed mails cannot be retried', async t => {
  const f = await fixture(t); const token = await f.activate();
  await f.request('/api/admin/approve', 'POST', { issueId: '001' }, adminToken);
  await f.request('/api/admin/send', 'POST', { issueId: '001' }, adminToken);
  const mail = f.db.prepare("SELECT * FROM outbox WHERE kind='digest'").get();
  await f.request('/api/unsubscribe', 'POST', {}, token);
  f.db.prepare("UPDATE outbox SET status='queued' WHERE id=?").run(mail.id);
  await deliver(f.db, f.config, mail.id);
  assert.equal(f.db.prepare('SELECT status FROM outbox WHERE id=?').get(mail.id).status, 'cancelled');
  f.db.prepare("UPDATE outbox SET status='failed',created_at=0 WHERE id=?").run(mail.id);
  assert.equal((await f.request('/api/admin/retry', 'POST', { id: mail.id }, adminToken)).status, 409);
});

test('matching respects all constraints and content includes sources without invented test results', () => {
  const catalog = loadCatalog();
  const result = matchProjects(catalog.projects, { topics: ['knowledge'], language: 'typescript', deployment: 'cloud' });
  assert.deepEqual(result.map(p => p.id), ['qdrant']);
  assert.equal(matchProjects(catalog.projects, { topics: ['agents'], language: 'typescript', deployment: 'local' }).length, 0);
  for (const p of catalog.projects) { assert.equal(p.evidence, '资料核查'); assert.equal(p.testedVersion, null); assert.ok(p.sources[0].url.startsWith('https://github.com/')); }
});

test('production configuration refuses incomplete email and security settings', () => {
  assert.throws(() => configuration({ NODE_ENV: 'production' }), /Production requires/);
  assert.throws(() => configuration({ ADMIN_TOKEN: 'short' }), /32 characters/);
  assert.throws(() => configuration({ MAIL_MODE: 'resend' }), /RESEND_API_KEY/);
  assert.throws(() => configuration({ BASE_URL: 'https://example.com/path' }), /web origin/);
  assert.doesNotThrow(() => configuration({ NODE_ENV: 'production', BASE_URL: 'https://example.com', MAIL_MODE: 'resend', RESEND_API_KEY: 'test', MAIL_FROM: 'test@example.com', ADMIN_TOKEN: adminToken }));
});
