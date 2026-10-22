import { readFileSync } from 'node:fs';
import { matchingProjects } from '../public/catalog-tools.js';

export function loadCatalog() {
  const catalog = JSON.parse(readFileSync(new URL('../content/catalog.json', import.meta.url), 'utf8'));
  let snapshots = { repositories: {} };
  try { snapshots = JSON.parse(readFileSync(new URL('../content/github-snapshots.json', import.meta.url), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const ids = new Set();
  for (const p of catalog.projects) {
    if (ids.has(p.id) || !/^[a-z0-9-]+$/.test(p.id)) throw new Error('Invalid project ID');
    ids.add(p.id);
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/.test(p.repo)) throw new Error(`Invalid repository: ${p.id}`);
    const snapshot = snapshots.repositories[p.repo];
    p.github = snapshot?.repo === p.repo ? snapshot : null;
    if (!p.sources?.length || !p.verifiedAt || !p.evidence) throw new Error(`Missing evidence: ${p.id}`);
    for (const s of p.sources) if (new URL(s.url).protocol !== 'https:') throw new Error('Source must use HTTPS');
  }
  const issueIds = new Set();
  for (const issue of catalog.issues) {
    if (!/^[a-z0-9-]+$/.test(issue.id) || issueIds.has(issue.id)) throw new Error('Invalid or duplicate issue ID');
    issueIds.add(issue.id);
    if (issue.projectIds.length !== new Set(issue.projectIds).size || !issue.projectIds.length) throw new Error(`Invalid project list in ${issue.id}`);
    if (issue.projectIds.some(id => !ids.has(id))) throw new Error(`Unknown project in ${issue.id}`);
  }
  catalog.issues.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id, 'en', { numeric: true }));
  return catalog;
}

export function validatePreferences(input, catalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请选择订阅偏好');
  if (!Array.isArray(input.topics)) throw new Error('请选择有效主题');
  const topics = [...new Set(input.topics)];
  if (!topics.length || topics.length > 3 || topics.some(t => !catalog.topics.some(x => x.id === t))) throw new Error('请选择至少一个有效主题');
  if (!['python', 'typescript', 'both'].includes(input.language)) throw new Error('请选择主要开发语言');
  if (!['any', 'local', 'selfhost', 'cloud'].includes(input.deployment)) throw new Error('请选择部署偏好');
  return { topics, language: input.language, deployment: input.deployment };
}

export function matchProjects(projects, preferences) {
  return matchingProjects(projects, preferences).slice(0, 5);
}

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
