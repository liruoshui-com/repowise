import { readFileSync } from 'node:fs';

export function loadCatalog() {
  const catalog = JSON.parse(readFileSync(new URL('../content/catalog.json', import.meta.url), 'utf8'));
  const ids = new Set();
  for (const p of catalog.projects) {
    if (ids.has(p.id) || !/^[a-z0-9-]+$/.test(p.id)) throw new Error('Invalid project ID');
    ids.add(p.id);
    if (!p.sources?.length || !p.verifiedAt || !p.evidence) throw new Error(`Missing evidence: ${p.id}`);
    for (const s of p.sources) if (new URL(s.url).protocol !== 'https:') throw new Error('Source must use HTTPS');
  }
  for (const issue of catalog.issues) {
    if (issue.projectIds.some(id => !ids.has(id))) throw new Error(`Unknown project in ${issue.id}`);
  }
  return catalog;
}

export function validatePreferences(input, catalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请选择订阅偏好');
  const topics = [...new Set(input.topics ?? [])];
  if (!topics.length || topics.length > 3 || topics.some(t => !catalog.topics.some(x => x.id === t))) throw new Error('请选择至少一个有效主题');
  if (!['python', 'typescript', 'both'].includes(input.language)) throw new Error('请选择主要开发语言');
  if (!['any', 'local', 'selfhost', 'cloud'].includes(input.deployment)) throw new Error('请选择部署偏好');
  return { topics, language: input.language, deployment: input.deployment };
}

export function matchProjects(projects, preferences) {
  return projects.filter(p => p.topics.some(t => preferences.topics.includes(t)))
    .filter(p => preferences.language === 'both' || p.languages.includes(preferences.language))
    .filter(p => preferences.deployment === 'any' || p.deployment.includes(preferences.deployment))
    .map(p => ({ ...p, reasons: p.topics.filter(t => preferences.topics.includes(t)) })).slice(0, 5);
}

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
