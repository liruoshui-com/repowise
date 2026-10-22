const $ = (selector, root = document) => root.querySelector(selector);
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let catalog; let me = null; let token = ''; let confirmationToken = ''; let adminToken = ''; let toastTimer;
try { token = sessionStorage.getItem('repowise-token') || ''; } catch {}
function saveToken(value) { token = value; try { value ? sessionStorage.setItem('repowise-token', value) : sessionStorage.removeItem('repowise-token'); } catch {} }
if (location.hash && ['/confirm', '/manage'].includes(location.pathname)) {
  const incoming = location.hash.slice(1);
  if (/^[A-Za-z0-9_-]{43}$/.test(incoming)) {
    if (location.pathname === '/confirm') confirmationToken = incoming;
    else saveToken(incoming);
  }
  history.replaceState(null, '', location.pathname);
}
async function api(path, { method = 'GET', body, admin = false, authenticated = true } = {}) {
  const auth = admin ? adminToken : authenticated ? token : '';
  const response = await fetch(path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败，请稍后重试');
  return data;
}
async function refreshMe() {
  if (!token) { me = null; return; }
  try { me = await api('/api/me'); } catch { me = null; saveToken(''); }
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
const topicName = id => catalog.topics.find(t => t.id === id)?.name || id;
const project = id => catalog.projects.find(p => p.id === id);
const latest = () => catalog.issues[0];
const icon = p => `<span class="project-icon ${e(p.color)}" aria-hidden="true">${e(p.mark)}</span>`;
const eyebrow = text => `<div class="eyebrow"><span class="dot"></span>${text}</div>`;
const localNotice = () => catalog.mailMode === 'local' ? '<div class="dev-notice">当前为本地体验，不会发送真实邮件。提交后前往 <a href="/dev/mail">本地邮件箱 ↗</a> 完成确认。</div>' : '';
const cta = () => `<section class="cta-band"><div><h2>让下一次选型，有据可依。</h2><p>选择你关心的场景，把值得看的项目送进收件箱。</p></div><a href="/subscribe" class="button dark">免费订阅周报 <span>↗</span></a></section>`;

function card(p) {
  return `<article class="project-card"><div class="project-top">${icon(p)}<div><h3><a href="/projects/${e(p.id)}">${e(p.name)}</a></h3><div class="repo">${e(p.repo)}</div></div></div><p class="summary">${e(p.summary)}</p><div class="project-meta">${p.topics.map(t => `<span class="pill">${e(topicName(t))}</span>`).join('')}<span class="pill">${p.languages.map(x => x === 'python' ? 'Python' : 'TS').join(' / ')}</span></div><div class="project-bottom"><span>◷ ${e(p.evidence)}</span><a href="/projects/${e(p.id)}">查看选型笔记 ↗</a></div></article>`;
}

function home() {
  const issue = latest();
  return `<div class="container"><section class="hero"><div>${eyebrow('A SMALL SIGNAL. A BETTER BUILD.')}<h1>少一点搜索，<br>多一点<em>构建。</em></h1><p class="lead">为 AI 应用开发者精选开源工具。<br>从实际场景出发，说明适用条件、使用代价，<br>以及值得你花时间尝试的理由。</p><div class="actions"><a class="button dark" href="/subscribe">找到我的工具 <span>↗</span></a><a class="button ghost" href="/weekly">先读一期样刊 <span>→</span></a></div><p class="hero-note">每周一封 · 按兴趣精选 · 随时退订</p></div><div class="hero-art" aria-label="本期知识库工作流：Docling 解析文档，LlamaIndex 组织检索，Qdrant 存储向量，Ragas 检查效果"><div class="art-top"><span>THE BUILDER'S READING LIST</span><span>VOL. 001</span></div><div class="art-paper"><span class="art-label">本期选题 / KNOWLEDGE STACK</span><h3>从文档，到可用的<br>AI 知识库。</h3>${issue.projectIds.map((id, i) => `<div class="flow-line"><span class="num">0${i + 1}</span><span class="flow-name">${e(project(id).name)}</span><span class="flow-desc">${['解析文档', '组织检索', '存储向量', '检查效果'][i]}</span></div>`).join('')}<div class="art-seal">场景优先<br>精选 04</div></div></div></section><div class="strip"><span><b>01</b> 从问题出发</span><span><b>02</b> 说明取舍</span><span><b>03</b> 标注验证依据</span><span><b>04</b> 持续积累</span></div><section><div class="section-head"><div><h2>这一期，值得打开。</h2><p>沿着一条真实工作流，认识几件趁手的工具。</p></div><a class="text-link" href="/weekly">阅读样刊 ↗</a></div><article class="issue-feature"><div class="issue-copy"><span class="pill orange">${e(issue.label)}</span> <span class="mono muted">VOL. ${e(issue.id)} / ${e(issue.date)}</span><h2>${e(issue.title)}</h2><p>${e(issue.subtitle)}</p><div class="actions"><a class="button small" href="/weekly">打开这一期 <span>→</span></a><span class="muted mono">4 PROJECTS · 约 5 分钟</span></div></div><div class="issue-sidebar">${issue.projectIds.map(id => `<a class="flow-line" href="/projects/${id}">${icon(project(id))}<span class="flow-name">${e(project(id).name)}</span><span>↗</span></a>`).join('')}</div></article></section><section><div class="section-head"><div><h2>你正在构建什么？</h2><p>按问题找工具，让推荐离你的工作近一点。</p></div><a href="/library" class="text-link">探索项目库 ↗</a></div><div class="topic-grid">${catalog.topics.map((t, i) => `<a href="/library?topic=${t.id}" class="topic-card"><span class="topic-icon">${['[ ≡ ]', '⌘ →', '{ ✓ }'][i]}</span><h3>${e(t.name)}</h3><p>${e(t.description)}</p><div class="topic-bottom"><span>${catalog.projects.filter(p => p.topics.includes(t.id)).length} 个精选项目</span><span>探索这个方向 ↗</span></div></a>`).join('')}</div></section>${cta()}</div>`;
}

function library() {
  const params = new URLSearchParams(location.search); const active = params.get('topic') || 'all';
  return `<div class="container bottom-space"><div class="page-top">${eyebrow('THE OPEN-SOURCE TOOLBOX')}<h1>找到适合下一步的工具。</h1><p>按场景浏览、比较取舍。每个项目都保留来源与核查日期，方便你继续判断。</p></div><div class="toolbar"><div class="filters" aria-label="按主题筛选"><button class="filter ${active === 'all' ? 'selected' : ''}" data-filter="all">全部项目</button>${catalog.topics.map(t => `<button class="filter ${active === t.id ? 'selected' : ''}" data-filter="${t.id}">${e(t.short)}</button>`).join('')}</div><label class="search"><span class="visually-hidden">搜索项目</span><input type="search" id="search" placeholder="搜索项目、用途或语言…" autocomplete="off"></label></div><div id="project-results" aria-live="polite"></div><div class="note-box">这里没有“综合评分”。适用场景、限制和验证依据，比一个孤立的分数更有用。</div></div>`;
}
function filterLibrary() {
  const topic = new URLSearchParams(location.search).get('topic') || 'all'; const query = ($('#search')?.value || '').toLowerCase().trim();
  const projects = catalog.projects.filter(p => (topic === 'all' || p.topics.includes(topic)) && `${p.name} ${p.repo} ${p.summary} ${p.fit} ${p.languages.join(' ')}`.toLowerCase().includes(query));
  $('#project-results').innerHTML = `<p class="result-count">${projects.length} 个项目 · 按编辑顺序展示</p><div class="project-grid">${projects.length ? projects.map(card).join('') : '<div class="empty"><h3>暂时没有匹配的项目</h3><p>换个关键词，或试试“全部项目”。</p></div>'}</div>`;
}
function weekly() {
  const issue = catalog.issues.find(i => i.id === new URLSearchParams(location.search).get('issue')) || latest();
  return `<div class="container bottom-space"><div class="page-top">${eyebrow(`REPOWISE WEEKLY / VOL. ${e(issue.id)}`)}<h1>${e(issue.title)}</h1><p>${e(issue.subtitle)}</p><span class="pill orange">${e(issue.label)}</span> <span class="mono muted">${e(issue.date)} · 约 5 分钟</span></div><div class="article-layout"><article><p class="article-intro">${e(issue.intro)}</p>${issue.projectIds.map(id => { const p = project(id); return `<section class="article-step" id="${id}"><p class="step-name">${e(p.stage)}</p><div class="project-top">${icon(p)}<h2>${e(p.name)}</h2></div><p>${e(p.summary)}</p><p><strong>什么情况下值得看：</strong>${e(p.fit)}</p><p><strong>需要接受的代价：</strong>${e(p.tradeoff)}</p><div class="actions"><a class="button small" href="/projects/${id}">完整选型笔记 ↗</a><span class="pill">${e(p.evidence)}</span></div></section>`; }).join('')}<div class="note-box"><strong>编辑手记</strong><p>${e(issue.editorNote)}</p></div></article><aside><div class="sidebar-box"><h3>这期的工作流</h3>${issue.projectIds.map((id, i) => `<a class="toc" href="#${id}">0${i + 1} <span class="muted">/</span> ${e(project(id).name)} ↘</a>`).join('')}<p class="detail-evidence">本期基于官方资料整理，尚未安装实测。选型建议属于编辑判断。</p><a class="button dark full" href="/subscribe">订阅下一期 ↗</a><p>不必全装。先解决你当前遇到的问题。</p></div></aside></div>${cta()}</div>`;
}
function detail(id) {
  const p = project(id); if (!p) return '<div class="narrow"><h1>项目不存在</h1><a href="/library">返回项目库</a></div>';
  const following = me?.follows.includes(id);
  return `<div class="container bottom-space"><div class="page-top"><a class="text-link" href="/library">← 返回项目库</a><div class="detail-header">${icon(p)}<div><h1>${e(p.name)}</h1><p class="mono muted">${e(p.repo)}</p></div></div><div class="project-meta">${p.topics.map(t => `<span class="pill">${e(topicName(t))}</span>`).join('')}</div></div><div class="article-layout"><article><h2 class="detail-title">${e(p.tagline)}</h2><p class="article-intro">${e(p.summary)}</p>${[['适合这样的任务', p.fit], ['先看清使用代价', p.tradeoff], ['与现有方案怎么选 · 编辑判断', p.comparison], ['建议的第一步 · 待你验证', p.nextStep]].map(([title, text]) => `<section class="detail-row"><h3>${title}</h3><p>${e(text)}</p></section>`).join('')}<section class="detail-row"><h3>核查记录与来源</h3><p>${e(p.verifiedAt)} · ${e(p.evidence)}。未安装实测，未绑定测试版本。以上是当前资料的摘要与编辑判断，部署前请复核官方文档。</p>${p.sources.map(s => `<p><a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${e(s.title)} ↗</a></p>`).join('')}</section><section class="detail-row"><h3>这个项目对你有用吗？</h3><div class="feedback">${[['try', '想试试'], ['used', '已使用'], ['irrelevant', '不相关']].map(([value, label]) => `<button data-feedback="${value}" data-project="${id}" class="${me?.feedback[id] === value ? 'selected' : ''}">${label}</button>`).join('')}</div><p class="detail-evidence">${me ? '反馈只关联你的订阅，用来了解实际采用情况。' : '确认订阅后可以保存反馈，帮助我们改进后续精选。'}</p></section></article><aside><div class="sidebar-box"><h3>值得加入候选清单？</h3><p>先阅读上手说明，再用自己的任务做一轮小规模验证。</p><a class="button dark full" href="https://github.com/${e(p.repo)}" target="_blank" rel="noopener noreferrer">打开 GitHub ↗</a><p></p><button class="button full" data-follow="${id}">${following ? '✓ 已关注 · 点击取消' : '+ 加入关注列表'}</button><p>关注项目会保存在订阅账户中。当前版本提供列表管理，重要变更提醒尚未上线。</p><div class="detail-evidence"><b>${e(p.evidence)}</b><br>核查日期 ${e(p.verifiedAt)}</div></div></aside></div></div>`;
}

function preferenceFields(prefs = { topics: ['knowledge'], language: 'both', deployment: 'any' }) {
  return `<fieldset><legend>你正在构建什么？<span class="muted"> 可多选</span></legend>${catalog.topics.map(t => `<label class="choice"><input type="checkbox" name="topics" value="${t.id}" ${prefs.topics.includes(t.id) ? 'checked' : ''}><span>${e(t.name)}<small>${e(t.description)}</small></span></label>`).join('')}</fieldset><div class="form-row"><div><label class="field" for="language">主要开发语言</label><select id="language" name="language">${[['both', 'Python + TypeScript'], ['python', 'Python'], ['typescript', 'TypeScript']].map(([v, l]) => `<option value="${v}" ${prefs.language === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div><label class="field" for="deployment">部署偏好</label><select id="deployment" name="deployment">${[['any', '都可以，按需选择'], ['local', '本地运行'], ['selfhost', '自托管'], ['cloud', '托管服务']].map(([v, l]) => `<option value="${v}" ${prefs.deployment === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`;
}
function subscribe() {
  return `<div class="container"><div class="form-layout"><div class="form-intro">${eyebrow('A LETTER FOR YOUR NEXT BUILD')}<h1>你的下一件好工具，<br>从这里开始。</h1><p>告诉我们你正在做什么。<br>每周一封，最多 5 个相关项目，<br>把适用条件与限制一起送达。</p><div class="promise"><p><span>✓</span> 从实际任务出发，不按 Star 排行</p><p><span>✓</span> 附原始来源，说明验证程度</p><p><span>✓</span> 免费订阅，随时调整或退出</p></div><a class="text-link" href="/weekly">还不确定？先看看创刊样刊 ↗</a></div><section class="form-panel"><h2>让推荐更贴近你</h2><p>选择偏好，确认邮箱，就可以开始。</p>${localNotice()}<form id="subscribe-form"><label class="field" for="email">邮箱地址</label><input id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email" maxlength="254" required><label class="honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>${preferenceFields()}<label class="consent"><input name="consent" type="checkbox" required><span>我同意接收 RepoWise 周报，并了解 <a href="/privacy">隐私说明</a>。可以随时退订。</span></label><button type="submit" class="button dark full">发送邮箱确认链接 <span>↗</span></button><div class="form-message" role="status"></div></form><p class="detail-evidence">已经订阅？<a href="/manage" class="text-link">获取管理链接</a></p></section></div></div>`;
}
function manage() {
  if (!me) return `<div class="narrow"><div class="form-panel">${eyebrow('YOUR READING PREFERENCES')}<h1>管理你的订阅</h1><p>输入订阅邮箱，我们会发送安全的管理链接。</p>${localNotice()}<form id="manage-link-form"><label class="field" for="email">订阅邮箱</label><input id="email" name="email" type="email" autocomplete="email" required><p></p><button class="button dark full">发送管理链接 ↗</button><div class="form-message" role="status"></div></form><p class="detail-evidence">还没有订阅？<a href="/subscribe">开始订阅 →</a></p></div></div>`;
  return `<div class="narrow">${eyebrow('MAKE IT YOURS')}<h1>让每周精选，更合你意。</h1><p>${e(me.email)}</p><section class="form-panel"><form id="preferences-form">${preferenceFields(me.preferences)}<p></p><button class="button dark full">保存订阅偏好</button><div class="form-message" role="status"></div></form></section><h2>我的关注列表</h2><p>保留候选项目，选型时再回来查看。</p><div class="saved-list">${me.follows.length ? me.follows.map(id => `<a href="/projects/${e(id)}">${e(project(id)?.name || id)} ↗</a>`).join('') : '<p class="muted">还没有关注项目，去 <a class="text-link" href="/library">项目库</a> 看看。</p>'}</div><h2>订阅控制</h2><p>退订后停止后续周报。删除数据会同时移除邮箱、偏好、反馈、关注和本服务中的邮件记录。</p><div class="actions"><button class="button danger small" data-action="unsubscribe">停止订阅</button><button class="button small" data-action="delete-account">删除我的数据</button><button class="button ghost small" data-action="logout">退出此设备</button></div></div>`;
}
function confirmPage() {
  return `<div class="narrow"><div class="form-panel"><div class="success-mark">↗</div><h1>只差最后一步。</h1><p>${confirmationToken ? '确认这是你的邮箱后，我们才会向你发送周报。' : '请从最新确认邮件打开此页面。如果链接已失效，可以重新订阅。'}</p>${confirmationToken ? '<button class="button dark" data-action="confirm">确认订阅 →</button>' : '<a href="/subscribe" class="button dark">重新获取确认链接 →</a>'}<div class="form-message" role="status"></div></div></div>`;
}
function method() {
  return `<div class="narrow">${eyebrow('OUR EDITORIAL PRINCIPLES')}<h1>推荐需要理由，<br>判断需要依据。</h1><p>RepoWise 帮助正在构建 AI 应用的人缩小候选范围。我们不会把一个项目的热度当作它适合你的证明。</p>${[['01 / 先明确任务', '每条推荐从具体任务开始：解析难处理的 PDF、组织多步执行，或定位一次失败回答。没有明确使用场景的项目，先留在候选池。'], ['02 / 说明收益，也说明代价', '推荐同时记录部署要求、额外服务依赖与维护负担。比较建议是编辑判断，不代表已经测出优劣。'], ['03 / 区分看过与用过', '“资料核查”表示阅读了官方资料；“安装验证”需要版本和环境；“任务实测”需要任务、结果和失败案例。当前首批内容全部处于资料核查阶段。'], ['04 / 推荐可以被修正', '项目说明保存核查日期与原始来源。后续修订应记录原因。旧文章不能替代部署时对当前文档的检查。'], ['05 / 不用数量填满收件箱', '每期按主题、语言和部署偏好匹配，最多 5 条，没有相关项目就不发送该期。Python 与 TypeScript 是接入路径，不一定是仓库的实现语言。'], ['06 / 内容与商业关系分开', '当前没有付费推荐位。未来如有赞助，会单独标注，不以赞助交换编辑结论。']].map(([h, p]) => `<section class="detail-row"><h3>${h}</h3><p>${p}</p></section>`).join('')}<p class="detail-evidence">匹配规则与内容记录可以在公开源码中查看。</p><a href="/subscribe" class="button dark">按我的场景订阅 ↗</a></div>`;
}
function privacy() {
  return `<div class="narrow">${eyebrow('YOUR DATA, YOUR CHOICE')}<h1>隐私说明</h1><p>更新日期：2026 年 10 月 22 日</p><h2>我们保存什么</h2><p>订阅邮箱、主题与技术偏好、订阅状态、确认时间，以及你主动提交的项目反馈与关注列表。服务保存必要的邮件投递记录，便于排查失败与避免重复发送。</p><h2>用来做什么</h2><p>发送你确认订阅的周报、处理管理请求，以及评估推荐是否相关。当前版本没有广告追踪、第三方分析脚本或邮件打开像素。</p><h2>邮件与第三方</h2><p>真实发信模式使用 Resend 投递邮件，邮箱地址与邮件内容会发送给该服务。当前实例的发信模式会在订阅页面说明。本地体验模式只保存邮件预览，不向外发送。</p><h2>链接与设备存储</h2><p>确认链接 24 小时有效，管理链接 30 天有效，请勿转发。管理令牌存储在当前标签页的会话存储中，退出此设备会清除本地令牌。数据库只存储用于验证的令牌摘要，但邮件记录包含原始链接，需作为敏感数据保护。</p><h2>退出与删除</h2><p>每封周报都有管理与退订入口。退订停止后续发送；管理页面的“删除我的数据”会删除本服务中的邮箱、偏好、反馈、关注与投递记录。邮件服务商的投递日志及运营者备份受其保留策略约束，不会因本地删除而即时清除。</p><h2>运营者部署说明</h2><p>此项目提供可自托管的订阅服务。正式运营者应在开放收件前补充自己的联系邮箱、数据保留期限和备份删除流程。</p><a class="button" href="/manage">管理订阅 →</a></div>`;
}
function adminPage() {
  return `<div class="container bottom-space"><div class="page-top">${eyebrow('EDITOR DESK')}<h1>编辑工作台</h1><p>核查内容、批准投递，再观察真实反馈。密钥仅用于当前页面会话。</p></div><form id="admin-login" class="form-panel"><label class="field" for="admin-token">编辑密钥</label><input id="admin-token" type="password" name="token" required autocomplete="off" placeholder="本地 .env 中的 ADMIN_TOKEN"><p></p><button class="button dark">打开工作台 →</button><div class="form-message" role="status"></div></form><div id="admin-content"></div></div>`;
}
async function loadAdmin() {
  const stats = await api('/api/admin/stats', { admin: true });
  $('#admin-login').hidden = true;
  const count = status => stats.subscribers.find(x => x.status === status)?.count || 0;
  $('#admin-content').innerHTML = `<div class="admin-grid"><div class="stat"><strong>${count('active')}</strong><span>已确认订阅</span></div><div class="stat"><strong>${count('pending')}</strong><span>待确认邮箱</span></div><div class="stat"><strong>${stats.feedback.reduce((n, r) => n + r.count, 0)}</strong><span>有效项目反馈</span></div></div>${localNotice()}<h2>刊物与投递</h2>${catalog.issues.map(i => { const approved = stats.publications.some(p => p.issue_id === i.id); return `<section class="article-step"><span class="mono">VOL. ${e(i.id)}</span><h3>${e(i.title)}</h3><p>内容由 content/catalog.json 管理。请先查看网页样刊与来源，再批准本期。</p><div class="actions"><a href="/weekly?issue=${e(i.id)}" class="button small">预览样刊</a><button class="button small" data-approve="${e(i.id)}" ${approved ? 'disabled' : ''}>${approved ? '✓ 已批准' : '批准本期投递'}</button><button class="button small dark" data-send="${e(i.id)}" ${approved ? '' : 'disabled'}>${catalog.mailMode === 'local' ? '生成本地周报' : '发送给匹配的订阅者'}</button></div></section>`; }).join('')}<h2>反馈概况</h2><div class="table-wrap"><table><thead><tr><th>项目</th><th>反馈</th><th>人数</th></tr></thead><tbody>${stats.feedback.length ? stats.feedback.map(r => `<tr><td>${e(project(r.project_id)?.name || r.project_id)}</td><td>${({ try: '想试试', used: '已使用', irrelevant: '不相关' })[r.value]}</td><td>${r.count}</td></tr>`).join('') : '<tr><td colspan="3">还没有反馈</td></tr>'}</tbody></table></div><h2>最近投递记录</h2><p class="muted">preview 表示本地预览；sent 表示邮件服务已接受，不能等同于收件成功。uncertain 需要核对邮件服务记录。</p><div class="table-wrap"><table><thead><tr><th>类型</th><th>期数</th><th>状态</th><th>尝试</th><th>处理</th></tr></thead><tbody>${stats.outbox.map(r => `<tr><td>${e(r.kind)}</td><td>${e(r.issue_id || '—')}</td><td>${e(r.status)}</td><td>${r.attempts}</td><td class="wrap">${r.status === 'failed' ? `<button class="button small" data-retry="${e(r.id)}">重试投递</button>` : ''}${e(r.error || '')}</td></tr>`).join('') || '<tr><td colspan="5">尚无投递记录</td></tr>'}</tbody></table></div>`;
}
async function mailbox() {
  const messages = await api('/api/dev/mail', { authenticated: false });
  $('#mail-list').innerHTML = messages.length ? messages.map(m => {
    const urls = [...new Set(m.text.match(/https?:\/\/[^\s]+/g) || [])];
    return `<section class="mail-item"><span class="pill">${e(m.status)}</span><h3>${e(m.subject)}</h3><p class="muted">收件人：${e(m.recipient)}</p><pre>${e(m.text)}</pre><div class="actions">${urls.map(url => `<a href="${e(url)}" class="button small">${url.includes('/confirm#') ? '打开确认链接' : url.includes('/manage#') ? '打开管理链接' : '查看项目'} ↗</a>`).join('')}</div></section>`;
  }).join('') : '<div class="empty">还没有邮件。先去订阅，再回来查看。</div>';
}

function render() {
  const path = location.pathname; document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', path === `/${a.dataset.nav}`));
  const views = { '/': home, '/library': library, '/weekly': weekly, '/subscribe': subscribe, '/manage': manage, '/confirm': confirmPage, '/method': method, '/privacy': privacy, '/admin': adminPage, '/dev/mail': () => '<div class="narrow"><h1>本地邮件箱</h1><p>仅在本地开发模式可访问。这里的邮件尚未真实发送。</p><button class="button small" data-action="refresh-mail">刷新邮件</button><div id="mail-list"></div></div>' };
  $('#main').innerHTML = path.startsWith('/projects/') ? detail(path.split('/').pop()) : (views[path] || (() => '<div class="narrow"><h1>页面不存在</h1><a href="/">返回首页</a></div>'))();
  document.title = `${$('#main h1')?.textContent || '为构建者精选'} · RepoWise`;
  if (path === '/library') filterLibrary();
  if (path === '/dev/mail') mailbox().catch(error => { $('#mail-list').textContent = error.message; });
  if (path === '/admin' && adminToken) loadAdmin().catch(error => { adminToken = ''; toast(error.message); });
}
function navigate(path) { history.pushState(null, '', path); render(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); }
window.addEventListener('popstate', render);
document.addEventListener('input', event => { if (event.target.id === 'search') filterLibrary(); });
document.addEventListener('click', async event => {
  const link = event.target.closest('a');
  if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0 && !link.target && !link.getAttribute('href').startsWith('#')) {
    const url = new URL(link.href);
    if (url.origin === location.origin && !url.hash) { event.preventDefault(); navigate(url.pathname + url.search); return; }
  }
  const button = event.target.closest('button'); if (!button || button.type === 'submit' && button.closest('form')) return;
  try {
    if (button.dataset.filter) {
      const query = $('#search').value;
      history.replaceState(null, '', `/library${button.dataset.filter === 'all' ? '' : `?topic=${button.dataset.filter}`}`);
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('selected', b === button));
      $('#search').value = query; filterLibrary(); return;
    }
    button.disabled = true;
    if (button.dataset.follow || button.dataset.feedback) {
      if (!me) { navigate('/manage'); toast('先通过邮箱管理链接登录，即可保存关注和反馈'); return; }
      if (button.dataset.follow) await api('/api/follow', { method: 'POST', body: { projectId: button.dataset.follow, follow: !me.follows.includes(button.dataset.follow) } });
      else await api('/api/feedback', { method: 'POST', body: { projectId: button.dataset.project, value: button.dataset.feedback } });
      await refreshMe(); render(); toast('已保存');
    }
    if (button.dataset.action === 'confirm') {
      const result = await api('/api/confirm', { method: 'POST', body: { token: confirmationToken }, authenticated: false });
      confirmationToken = ''; saveToken(result.token); await refreshMe(); navigate('/manage'); toast('订阅已确认，偏好已保存');
    }
    if (button.dataset.action === 'logout') { saveToken(''); me = null; navigate('/manage'); }
    if (['unsubscribe', 'delete-account'].includes(button.dataset.action)) {
      const deleting = button.dataset.action === 'delete-account';
      if (!window.confirm(deleting ? '确定删除邮箱、偏好、关注和反馈？此操作无法撤销。' : '确定停止接收后续周报？')) return;
      await api(deleting ? '/api/me' : '/api/unsubscribe', { method: deleting ? 'DELETE' : 'POST', body: {} });
      saveToken(''); me = null;
      $('#main').innerHTML = `<div class="narrow"><div class="success-mark">✓</div><h1>${deleting ? '你的数据已删除。' : '已停止订阅。'}</h1><p>不会再向你发送周报。以后需要时，随时回来。</p><a href="/" class="button">返回首页</a></div>`;
    }
    if (button.dataset.action === 'refresh-mail') await mailbox();
    if (button.dataset.approve) { await api('/api/admin/approve', { method: 'POST', admin: true, body: { issueId: button.dataset.approve } }); await loadAdmin(); toast('本期已批准'); }
    if (button.dataset.send) {
      if (!window.confirm(catalog.mailMode === 'local' ? '为匹配的已确认订阅者生成本地周报？' : '确认向匹配的已确认订阅者发送本期周报？')) return;
      const result = await api('/api/admin/send', { method: 'POST', admin: true, body: { issueId: button.dataset.send } });
      await loadAdmin(); toast(`处理 ${result.queued} 封，跳过 ${result.skipped} 位；结果见投递记录`);
    }
    if (button.dataset.retry) { await api('/api/admin/retry', { method: 'POST', admin: true, body: { id: button.dataset.retry } }); await loadAdmin(); toast('重试完成，请查看投递状态'); }
  } catch (error) { toast(error.message); const msg = $('.form-message'); if (msg) { msg.textContent = error.message; msg.className = 'form-message error'; } }
  finally { button.disabled = false; }
});
document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; const fields = new FormData(form); const button = $('button[type=submit], button:not([type])', form); const message = $('.form-message', form);
  const preferences = () => ({ topics: fields.getAll('topics'), language: fields.get('language'), deployment: fields.get('deployment') });
  button.disabled = true; message.textContent = '正在处理…'; message.className = 'form-message';
  try {
    if (form.id === 'subscribe-form' || form.id === 'manage-link-form') {
      const signingUp = form.id === 'subscribe-form';
      const result = await api(signingUp ? '/api/subscribe' : '/api/manage-link', { method: 'POST', authenticated: false, body: { email: fields.get('email'), website: fields.get('website'), ...(signingUp ? { preferences: preferences(), consent: fields.get('consent') === 'on' } : {}) } });
      message.innerHTML = result.delivery === 'local' ? '邮件已进入本地预览流程。<br><a class="text-link" href="/dev/mail">打开本地邮件箱，完成确认 →</a>' : e(result.message);
    }
    if (form.id === 'preferences-form') { await api('/api/me', { method: 'PATCH', body: { preferences: preferences() } }); await refreshMe(); message.textContent = '偏好已保存，后续周报会使用新的筛选条件。'; }
    if (form.id === 'admin-login') { adminToken = fields.get('token'); await loadAdmin(); }
    message.className = 'form-message success';
  } catch (error) { message.textContent = error.message; message.className = 'form-message error'; }
  finally { button.disabled = false; }
});

try { catalog = await api('/api/catalog', { authenticated: false }); await refreshMe(); render(); }
catch { $('#main').innerHTML = '<div class="narrow"><h1>暂时无法打开工具箱。</h1><p>请检查网络或稍后刷新页面。</p><a href="/" class="button">重新加载</a></div>'; }
