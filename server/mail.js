import { randomUUID } from 'node:crypto';
import { escapeHtml as e } from './content.js';

export function enqueue(db, { subscriber, kind, issueId = null, subject, html, text }) {
  const id = randomUUID();
  const result = db.prepare(`INSERT OR IGNORE INTO outbox
    (id,subscriber_id,kind,issue_id,recipient,subject,html,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, subscriber.id, kind, issueId, subscriber.email, subject, html, text, Date.now());
  return result.changes ? id : null;
}

export function mailLayout(title, content, footer = 'RepoWise · 为正在构建 AI 应用的人精选') {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="margin:0;background:#f5f4f0;color:#252626;font:16px/1.8 Arial,sans-serif"><main style="max-width:600px;margin:32px auto;padding:32px;background:white;border-top:4px solid #537657"><p style="font-weight:bold;letter-spacing:2px">REPOWISE / 开源精选</p><h1 style="font-size:26px">${e(title)}</h1>${content}<hr style="border:0;border-top:1px solid #ddd;margin-top:32px"><p style="font-size:12px;color:#777">${footer}</p></main></body></html>`;
}

export async function deliver(db, config, id, fetchImpl = fetch) {
  // A synchronous claim prevents concurrent requests from sending the same message twice.
  const claimed = db.prepare("UPDATE outbox SET status='sending', attempts=attempts+1 WHERE id=? AND status='queued'").run(id);
  if (!claimed.changes) return;
  const row = db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
  if (row.kind === 'digest' && db.prepare('SELECT status FROM subscribers WHERE id=?').get(row.subscriber_id)?.status !== 'active') {
    db.prepare("UPDATE outbox SET status='cancelled' WHERE id=?").run(id); return;
  }
  if (config.mailMode === 'local') {
    db.prepare("UPDATE outbox SET status='preview', sent_at=? WHERE id=?").run(Date.now(), id); return;
  }
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `repowise/${id}` },
      body: JSON.stringify({ from: config.mailFrom, to: [row.recipient], subject: row.subject, html: row.html, text: row.text })
    });
    if (!response.ok) throw new Error(`邮件服务返回 HTTP ${response.status}`);
    db.prepare("UPDATE outbox SET status='sent', sent_at=?, error=NULL WHERE id=?").run(Date.now(), id);
  } catch (error) {
    db.prepare("UPDATE outbox SET status='failed', error=? WHERE id=?").run(error.name === 'TimeoutError' ? '邮件服务请求超时' : '邮件服务投递失败，请检查配置或服务状态', id);
  }
}
