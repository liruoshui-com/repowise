import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { openStore } from './store.js';
import { loadCatalog, validatePreferences, matchProjects, escapeHtml as e } from './content.js';
import { enqueue, deliver, mailLayout } from './mail.js';

const hash = token => createHash('sha256').update(token).digest('hex');
const failure = (status, message) => Object.assign(new Error(message), { status });
const publicDir = new URL('../public/', import.meta.url);
const routes = new Set(['/', '/library', '/weekly', '/subscribe', '/manage', '/confirm', '/privacy', '/method', '/admin', '/dev/mail']);
const assets = new Set(['/app.js', '/style.css', '/favicon.svg']);

export function configuration(env = process.env) {
  const config = {
    port: Number(env.PORT || 3000), host: env.HOST || '127.0.0.1',
    baseUrl: (env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    dataDir: resolve(env.DATA_DIR || './var'), mailMode: env.MAIL_MODE || 'local',
    adminToken: env.ADMIN_TOKEN || '', resendKey: env.RESEND_API_KEY || '', mailFrom: env.MAIL_FROM || '',
    production: env.NODE_ENV === 'production'
  };
  if (!['local', 'resend'].includes(config.mailMode)) throw new Error('MAIL_MODE must be local or resend');
  if (config.mailMode === 'resend' && (!config.resendKey || !config.mailFrom)) throw new Error('Resend requires RESEND_API_KEY and MAIL_FROM');
  const url = new URL(config.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('BASE_URL must be a web origin');
  if (config.production && (url.protocol !== 'https:' || config.mailMode !== 'resend' || config.adminToken.length < 32)) throw new Error('Production requires HTTPS BASE_URL, Resend and ADMIN_TOKEN (32+ characters)');
  if (config.adminToken && config.adminToken.length < 32) throw new Error('ADMIN_TOKEN must contain at least 32 characters');
  return config;
}

export function createApp(config, { fetchImpl = fetch } = {}) {
  const db = openStore(config.dataDir);
  const catalog = loadCatalog();
  const limits = new Map();
  let digestBusy = false;
  // Ambiguous sends are deliberately not auto-retried after a crash.
  db.prepare("UPDATE outbox SET status='uncertain', error='进程中断；请核对邮件服务记录后处理' WHERE status='sending'").run();
  db.prepare('DELETE FROM tokens WHERE expires_at < ?').run(Date.now());

  function mint(subscriberId, kind, payload = null) {
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO tokens VALUES (?,?,?,?,?)').run(hash(token), subscriberId, kind, Date.now() + (kind === 'confirm' ? 86400000 : 30 * 86400000), payload ? JSON.stringify(payload) : null);
    return token;
  }
  function bearer(req) { return req.headers.authorization?.replace(/^Bearer /, '') || ''; }
  function subscriber(req) {
    const row = db.prepare(`SELECT s.*, t.kind FROM tokens t JOIN subscribers s ON s.id=t.subscriber_id
      WHERE t.hash=? AND t.kind='manage' AND t.expires_at>?`).get(hash(bearer(req)), Date.now());
    if (!row || row.status !== 'active') throw failure(401, '管理链接已失效，请重新获取邮件链接');
    return row;
  }
  function admin(req) {
    const supplied = Buffer.from(bearer(req)); const expected = Buffer.from(config.adminToken);
    if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw failure(401, '请输入有效的编辑密钥');
  }
  function local(req) {
    const host = new URL(`http://${req.headers.host}`).hostname;
    if (config.production || config.mailMode !== 'local' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !['localhost', '127.0.0.1', '[::1]'].includes(host)) throw failure(404, '页面不存在');
  }
  function rate(req, bucket, max = 15) {
    const now = Date.now();
    if (limits.size > 5000) for (const [key, value] of limits) if (value.until < now) limits.delete(key);
    if (limits.size > 10000) throw failure(429, '请求繁忙，请稍后重试');
    const key = `${req.socket.remoteAddress}:${bucket}`;
    let entry = limits.get(key);
    if (!entry || entry.until < now) { entry = { count: 0, until: now + 600000 }; limits.set(key, entry); }
    if (++entry.count > max) throw failure(429, '操作过于频繁，请十分钟后再试');
  }
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw failure(415, '请使用 JSON 请求');
    let chunks = ''; let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 16384) throw failure(413, '请求内容过长');
      chunks += chunk;
    }
    try { const result = JSON.parse(chunks); if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); return result; }
    catch { throw failure(400, '请求格式有误'); }
  }
  const sendMail = id => id ? deliver(db, config, id, fetchImpl) : Promise.resolve();
  const issueHash = issue => hash(JSON.stringify({ issue, projects: issue.projectIds.map(id => catalog.projects.find(p => p.id === id)) }));
  function profile(row) {
    return { email: row.email, preferences: JSON.parse(row.preferences),
      follows: db.prepare('SELECT project_id FROM follows WHERE subscriber_id=?').all(row.id).map(x => x.project_id),
      feedback: Object.fromEntries(db.prepare('SELECT project_id,value FROM feedback WHERE subscriber_id=?').all(row.id).map(x => [x.project_id, x.value])) };
  }
  async function digest(issueId) {
    if (digestBusy) throw failure(409, '已有投递任务进行中');
    const issue = catalog.issues.find(i => i.id === issueId && i.status === 'published');
    if (!issue || db.prepare('SELECT content_hash FROM publications WHERE issue_id=?').get(issueId)?.content_hash !== issueHash(issue)) throw failure(400, '请先审核并批准这一期；修改内容后需要重新批准');
    digestBusy = true;
    let queued = 0; let skipped = 0;
    try {
      for (const s of db.prepare("SELECT * FROM subscribers WHERE status='active'").all()) {
        if (db.prepare('SELECT 1 FROM outbox WHERE subscriber_id=? AND issue_id=?').get(s.id, issueId)) { skipped++; continue; }
        const picks = matchProjects(issue.projectIds.map(id => catalog.projects.find(p => p.id === id)), JSON.parse(s.preferences));
        if (!picks.length) { skipped++; continue; }
        const manage = `${config.baseUrl}/manage#${mint(s.id, 'manage')}`;
        const text = `${issue.title}\n\n${picks.map(p => `${p.name}：${p.summary}\n适合：${p.fit}\n限制：${p.tradeoff}\n验证：${p.evidence}（${p.verifiedAt}）\n${config.baseUrl}/projects/${p.id}`).join('\n\n')}\n\n管理偏好或退订：${manage}`;
        const html = mailLayout(issue.title, `<p>根据你的主题、语言和部署偏好，选出 ${picks.length} 个候选项目。</p>${picks.map(p => `<h2><a href="${config.baseUrl}/projects/${p.id}">${e(p.name)}</a></h2><p>${e(p.summary)}</p><p><b>适合：</b>${e(p.fit)}</p><p><b>限制：</b>${e(p.tradeoff)}</p><p style="color:#777;font-size:13px">${e(p.evidence)} · ${e(p.verifiedAt)}</p>`).join('')}<p><a href="${manage}">管理偏好 / 退订</a></p>`);
        const id = enqueue(db, { subscriber: s, kind: 'digest', issueId, subject: `RepoWise #${issue.id} · ${issue.title}`, html, text });
        if (id) { queued++; await sendMail(id); }
      }
      return { queued, skipped, delivery: config.mailMode };
    } finally { digestBusy = false; }
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, config.baseUrl); const path = url.pathname;
      if (req.headers.origin && req.headers.origin !== config.baseUrl) throw failure(403, '请求来源不受信任');
      if (path.startsWith('/api/')) {
        if (req.method === 'GET' && path === '/api/health') return json(200, { ok: true });
        if (req.method === 'GET' && path === '/api/catalog') return json(200, { ...catalog, issues: catalog.issues.filter(i => i.status === 'published'), mailMode: config.mailMode });
        if (req.method === 'POST' && ['/api/subscribe', '/api/manage-link'].includes(path)) {
          rate(req, 'signup'); const input = await body(req);
          if (input.website) return json(202, { message: '请检查邮箱', delivery: config.mailMode });
          const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
          if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw failure(400, '请输入有效邮箱');
          let prefs;
          if (path === '/api/subscribe') {
            if (input.consent !== true) throw failure(400, '请确认订阅与隐私说明');
            try { prefs = validatePreferences(input.preferences, catalog); } catch (error) { throw failure(400, error.message); }
          }
          let s = db.prepare('SELECT * FROM subscribers WHERE email=?').get(email);
          if (!s && path === '/api/subscribe') {
            const result = db.prepare('INSERT INTO subscribers(email,preferences,created_at) VALUES (?,?,?)').run(email, JSON.stringify(prefs), Date.now());
            s = db.prepare('SELECT * FROM subscribers WHERE id=?').get(result.lastInsertRowid);
          }
          if (s && Date.now() - s.last_request > 60000 && (path === '/api/subscribe' || s.status === 'active')) {
            const kind = s.status === 'active' ? 'manage' : 'confirm';
            db.prepare('UPDATE subscribers SET last_request=? WHERE id=?').run(Date.now(), s.id);
            if (kind === 'confirm') db.prepare("DELETE FROM tokens WHERE subscriber_id=? AND kind='confirm'").run(s.id);
            const token = mint(s.id, kind, kind === 'confirm' ? prefs : null);
            const link = `${config.baseUrl}/${kind === 'confirm' ? 'confirm' : 'manage'}#${token}`;
            const title = kind === 'confirm' ? '确认你的 RepoWise 订阅' : '管理你的 RepoWise 订阅';
            const id = enqueue(db, { subscriber: s, kind, subject: title,
              html: mailLayout(title, `<p>${kind === 'confirm' ? '点击下方链接并确认后，才会开始接收周报。确认链接 24 小时内有效。' : '通过下方链接修改偏好或退订。管理链接 30 天内有效，请勿转发。'}</p><p><a href="${link}">${e(title)} →</a></p><p>如果不是你发起的请求，忽略这封邮件即可。</p>`), text: `${title}\n${link}\n如果不是你发起的请求，请忽略。` });
            await sendMail(id);
            if (db.prepare('SELECT status FROM outbox WHERE id=?').get(id)?.status === 'failed') db.prepare('UPDATE subscribers SET last_request=0 WHERE id=?').run(s.id);
          }
          return json(202, { message: '若邮箱可以接收此请求，我们将发送确认或管理链接。请检查收件箱和垃圾邮件。', delivery: config.mailMode });
        }
        if (req.method === 'POST' && path === '/api/confirm') {
          rate(req, 'confirm', 30); const input = await body(req);
          const token = db.prepare("SELECT * FROM tokens WHERE hash=? AND kind='confirm' AND expires_at>?").get(hash(String(input.token || '')), Date.now());
          if (!token) throw failure(400, '确认链接已过期或已使用，请重新订阅');
          db.exec('BEGIN');
          try {
            db.prepare("UPDATE subscribers SET status='active',preferences=?,confirmed_at=? WHERE id=?").run(token.payload, Date.now(), token.subscriber_id);
            db.prepare('DELETE FROM tokens WHERE subscriber_id=?').run(token.subscriber_id);
            const managementToken = mint(token.subscriber_id, 'manage');
            db.exec('COMMIT'); return json(200, { token: managementToken });
          } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
        if (path === '/api/me' && req.method === 'GET') return json(200, profile(subscriber(req)));
        if (path === '/api/me' && req.method === 'PATCH') {
          const s = subscriber(req); const input = await body(req); let prefs;
          try { prefs = validatePreferences(input.preferences, catalog); } catch (error) { throw failure(400, error.message); }
          db.prepare('UPDATE subscribers SET preferences=? WHERE id=?').run(JSON.stringify(prefs), s.id);
          return json(200, { ok: true });
        }
        if (path === '/api/unsubscribe' && req.method === 'POST') {
          const s = subscriber(req); await body(req);
          db.exec('BEGIN');
          try {
            db.prepare("UPDATE subscribers SET status='unsubscribed' WHERE id=?").run(s.id);
            db.prepare('DELETE FROM tokens WHERE subscriber_id=?').run(s.id);
            db.prepare("UPDATE outbox SET status='cancelled' WHERE subscriber_id=? AND status IN ('queued','failed')").run(s.id);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          return json(200, { ok: true });
        }
        if (path === '/api/me' && req.method === 'DELETE') {
          const s = subscriber(req); await body(req);
          db.prepare('DELETE FROM subscribers WHERE id=?').run(s.id); return json(200, { ok: true });
        }
        if (['/api/feedback', '/api/follow'].includes(path) && req.method === 'POST') {
          const s = subscriber(req); const input = await body(req);
          if (!catalog.projects.some(p => p.id === input.projectId)) throw failure(400, '项目不存在');
          if (path === '/api/feedback') {
            if (!['irrelevant', 'try', 'used'].includes(input.value)) throw failure(400, '反馈类型无效');
            db.prepare('INSERT INTO feedback VALUES (?,?,?,?) ON CONFLICT(subscriber_id,project_id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(s.id, input.projectId, input.value, Date.now());
          } else {
            if (typeof input.follow !== 'boolean') throw failure(400, '关注状态无效');
            if (input.follow) db.prepare('INSERT OR IGNORE INTO follows VALUES (?,?)').run(s.id, input.projectId);
            else db.prepare('DELETE FROM follows WHERE subscriber_id=? AND project_id=?').run(s.id, input.projectId);
          }
          return json(200, { ok: true });
        }
        if (path === '/api/dev/mail' && req.method === 'GET') {
          local(req); return json(200, db.prepare('SELECT id,recipient,subject,text,status FROM outbox ORDER BY created_at DESC LIMIT 50').all());
        }
        if (path.startsWith('/api/admin/')) {
          rate(req, 'admin', 120); admin(req);
          if (path === '/api/admin/stats' && req.method === 'GET') return json(200, {
            subscribers: db.prepare('SELECT status, COUNT(*) AS count FROM subscribers GROUP BY status').all(),
            feedback: db.prepare('SELECT project_id,value,COUNT(*) AS count FROM feedback GROUP BY project_id,value').all(),
            mail: db.prepare('SELECT status,COUNT(*) AS count FROM outbox GROUP BY status').all(),
            outbox: db.prepare('SELECT id,kind,issue_id,status,attempts,error FROM outbox ORDER BY created_at DESC LIMIT 50').all(),
            publications: db.prepare('SELECT * FROM publications').all().filter(p => { const issue = catalog.issues.find(i => i.id === p.issue_id); return issue && p.content_hash === issueHash(issue); })
          });
          if (path === '/api/admin/approve' && req.method === 'POST') {
            const input = await body(req);
            if (!catalog.issues.some(i => i.id === input.issueId && i.status === 'published')) throw failure(400, '刊物不存在');
            const issue = catalog.issues.find(i => i.id === input.issueId);
            db.prepare('INSERT INTO publications VALUES (?,?,?) ON CONFLICT(issue_id) DO UPDATE SET approved_at=excluded.approved_at,content_hash=excluded.content_hash').run(input.issueId, Date.now(), issueHash(issue)); return json(200, { ok: true });
          }
          if (path === '/api/admin/send' && req.method === 'POST') return json(200, await digest((await body(req)).issueId));
          if (path === '/api/admin/retry' && req.method === 'POST') {
            const input = await body(req); const mail = db.prepare('SELECT * FROM outbox WHERE id=?').get(input.id);
            if (!mail || mail.status !== 'failed') throw failure(400, '仅可重试明确失败的邮件');
            // Resend retains idempotency keys for 24 hours. Avoid duplicates after that window.
            if (Date.now() - mail.created_at > 23 * 3600000) throw failure(409, '已超过安全重试窗口，请到邮件服务核对投递结果');
            db.prepare("UPDATE outbox SET status='queued' WHERE id=? AND status='failed'").run(mail.id);
            await sendMail(mail.id); return json(200, { ok: true });
          }
        }
        throw failure(404, '接口不存在');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw failure(405, '不支持此请求方法');
      if (path === '/dev/mail') local(req);
      const isProject = /^\/projects\/[a-z0-9-]+$/.test(path) && catalog.projects.some(p => `/projects/${p.id}` === path);
      if (!routes.has(path) && !assets.has(path) && !isProject) throw failure(404, '页面不存在');
      const file = assets.has(path) ? path.slice(1) : 'index.html';
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(file)];
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(new URL(file, publicDir)));
    } catch (error) {
      if (!error.status) console.error('Request failed:', error.message);
      if (!res.headersSent) json(error.status || 500, { error: error.status ? error.message : '服务暂时不可用，请稍后重试' });
      else res.end();
    }
  });
  return { server, db, catalog, digest };
}
