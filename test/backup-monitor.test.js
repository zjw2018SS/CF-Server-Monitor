import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBackup, checkBackupHealth } from '../src/services/backupMonitor.js';
const now = Date.parse('2026-10-02T12:00:00Z');
const good = { state: 'ok', completed_at: new Date(now - 1000).toISOString(), full_d1: true, r2: true, worker: true, restore_verified: true, secrets_recoverable: true };
function setup() {
  let value; const messages = [];
  const env = { EDGE_BACKUP_HEALTH_URL: 'https://example.test/health.json', DB: { prepare: sql => ({ bind: (...args) => ({ first: async () => value ? { value } : null, run: async () => { value = args[1]; } }) }) } };
  const opts = { now, fetch: async () => new Response(JSON.stringify(good)), settings: async () => ({ tg_bot_token: 'mock' }), notify: async (_, message) => { messages.push(message); } };
  return { env, opts, messages };
}
test('fresh complete backup is healthy; stale, future, incomplete and failed are rejected', () => {
  assert.equal(assessBackup(good, now), 'ok');
  assert.equal(assessBackup({ ...good, completed_at: new Date(now - 37 * 3600_000).toISOString() }, now), 'stale');
  assert.equal(assessBackup({ ...good, completed_at: new Date(now + 600_000).toISOString() }, now), 'invalid');
  assert.equal(assessBackup({ ...good, secrets_recoverable: false }, now), 'incomplete');
  assert.equal(assessBackup({ state: 'failed' }, now), 'failed');
});
test('healthy first check stays silent; failure alerts once, reminds daily and reports recovery once', async () => {
  const { env, opts, messages } = setup();
  assert.equal((await checkBackupHealth(env, opts)).notified, false);
  const failed = { ...opts, fetch: async () => { throw Error('offline'); } };
  assert.equal((await checkBackupHealth(env, failed)).notified, true);
  assert.equal((await checkBackupHealth(env, { ...failed, now: now + 3600_000 })).notified, false);
  assert.equal((await checkBackupHealth(env, { ...failed, now: now + 25 * 3600_000 })).notified, true);
  assert.equal((await checkBackupHealth(env, { ...opts, now: now + 25 * 3600_000 })).notified, true);
  assert.equal((await checkBackupHealth(env, { ...opts, now: now + 25 * 3600_000 })).notified, false);
  assert.equal(messages.length, 3);
});
test('failed delivery is retried, and disabled monitor never fetches', async () => {
  const { env, opts } = setup();
  const bad = { ...opts, fetch: async () => new Response('{}'), notify: async () => 'delivery failed' };
  await assert.rejects(checkBackupHealth(env, bad), /notification failed/);
  assert.equal((await checkBackupHealth(env, { ...bad, notify: async () => undefined })).notified, true);
  assert.deepEqual(await checkBackupHealth({}, { fetch: () => { throw Error('must not fetch'); } }), { enabled: false });
});
test('isolated backup notification credentials override the destination only inside this monitor', async () => {
  const { env, opts } = setup();
  env.BACKUP_TELEGRAM_BOT_TOKEN = 'existing-monitor-token';
  env.BACKUP_TELEGRAM_CHAT_ID = 'existing-monitor-chat';
  const site = { notification_webhook_enabled: 'true', notification_webhook_url: 'https://unrelated.test' };
  let captured;
  await checkBackupHealth(env, { ...opts, fetch: async () => new Response('{}'), settings: async () => site, notify: async settings => { captured = settings; } });
  assert.equal(captured.tg_bot_token, env.BACKUP_TELEGRAM_BOT_TOKEN);
  assert.equal(captured.tg_chat_id, env.BACKUP_TELEGRAM_CHAT_ID);
  assert.equal(captured.notification_webhook_enabled, 'false');
  assert.deepEqual(site, { notification_webhook_enabled: 'true', notification_webhook_url: 'https://unrelated.test' });
});
