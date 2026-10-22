const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function rssFeed(catalog, baseUrl, topic = null) {
  const issues = catalog.issues.filter(i => i.status === 'published' && (!topic || i.projectIds.some(id => catalog.projects.find(p => p.id === id)?.topics.includes(topic))));
  const title = `RepoWise${topic ? ` · ${catalog.topics.find(t => t.id === topic)?.name || topic}` : ' · 开源工具精选'}`;
  const feedUrl = `${baseUrl}/feed.xml${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${xml(title)}</title><link>${xml(baseUrl + '/archive')}</link>
<description>从实际开发场景出发，说明开源工具的适用条件与限制。</description><language>zh-CN</language>
<atom:link href="${xml(feedUrl)}" rel="self" type="application/rss+xml"/>
${issues.map(issue => `<item><title>${xml(issue.title)}</title><link>${xml(`${baseUrl}/weekly?issue=${issue.id}`)}</link><guid isPermaLink="true">${xml(`${baseUrl}/weekly?issue=${issue.id}`)}</guid><pubDate>${new Date(`${issue.date}T09:00:00+08:00`).toUTCString()}</pubDate><description>${xml(`${issue.subtitle}\n\n${issue.intro}\n\n本期项目：${issue.projectIds.map(id => catalog.projects.find(p => p.id === id)?.name).join('、')}`)}</description></item>`).join('\n')}
</channel></rss>`;
}
