import { loadSiteSettings } from '../utils/settings.js';
import { sendNotification } from './notification.js';

const KEY = 'edgeever_backup_monitor_state';
const MAX_AGE = 36 * 3600_000;
const REMINDER = 24 * 3600_000;

export function assessBackup(payload, now) {
  if (payload?.state !== 'ok') return 'failed';
  const completed = Date.parse(payload.completed_at);
  if (!Number.isFinite(completed) || completed > now + 300_000) return 'invalid';
  if (now - completed > MAX_AGE) return 'stale';
  if (!['full_d1', 'r2', 'worker', 'restore_verified', 'secrets_recoverable'].every(k => payload[k] === true)) return 'incomplete';
  return 'ok';
}

export async function checkBackupHealth(env, options = {}) {
  if (!env.EDGE_BACKUP_HEALTH_URL) return { enabled: false };
  const now = options.now ?? Date.now();
  const fetcher = options.fetch ?? fetch;
  const settingsLoader = options.settings ?? loadSiteSettings;
  const notify = options.notify ?? sendNotification;
  let state;
  try {
    const response = await fetcher(env.EDGE_BACKUP_HEALTH_URL, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'EdgeEverBackupMonitor/1.0' },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store'
    });
    state = response.ok ? assessBackup(await response.json(), now) : 'unreachable';
  } catch { state = 'unreachable'; }
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
  let previous = {};
  try { previous = JSON.parse(row?.value || '{}'); } catch { /* Treat malformed saved state as a first check. */ }
  const recovery = state === 'ok' && previous.alerted === true;
  const alert = state !== 'ok' && (previous.state !== state || !previous.alerted || now - (previous.notified_at || 0) >= REMINDER);
  let notified = false;
  if (alert || recovery) {
    const settings = { ...await settingsLoader(env.DB) };
    // The backup monitor can reuse the existing monitoring destination without changing site-wide notifications.
    if (env.BACKUP_TELEGRAM_BOT_TOKEN && env.BACKUP_TELEGRAM_CHAT_ID) {
      settings.notification_webhook_enabled = 'false';
      settings.tg_bot_token = env.BACKUP_TELEGRAM_BOT_TOKEN;
      settings.tg_chat_id = env.BACKUP_TELEGRAM_CHAT_ID;
    }
    const hasTarget = settings.notification_webhook_enabled === 'true'
      ? Boolean(String(settings.notification_webhook_url || '').trim())
      : Boolean(String(settings.tg_bot_token || '').trim());
    if (!hasTarget) throw new Error('EdgeEver backup monitor has no configured notification target');
    const message = recovery
      ? 'EdgeEver 完整备份已恢复正常，数据库、附件、程序、凭据恢复条件与异地恢复验证均通过。'
      : `EdgeEver 完整备份异常：${state}。请检查 NY-1 上 edgeever-full-backup.service；超过 36 小时未成功、备份失败、覆盖缺失或状态不可达均会告警。`;
    const error = await notify(settings, message, { type: 'backup', title: recovery ? 'EdgeEver 备份恢复' : 'EdgeEver 备份告警' });
    if (error) throw new Error('EdgeEver backup notification failed');
    notified = true;
  }
  const saved = { state, checked_at: now, alerted: state !== 'ok' && (notified || previous.alerted === true), notified_at: notified ? now : previous.notified_at || 0 };
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(KEY, JSON.stringify(saved)).run();
  return { enabled: true, state, notified };
}
