import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Collect public metadata only. Candidates never become recommendations automatically.
const queries = ['topic:rag archived:false stars:>100', 'topic:ai-agents archived:false stars:>100', 'topic:llm-evaluation archived:false stars:>50'];
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'RepoWise/0.1', 'X-GitHub-Api-Version': '2022-11-28' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const candidates = new Map();
for (const q of queries) {
  const url = new URL('https://api.github.com/search/repositories');
  url.search = new URLSearchParams({ q, sort: 'updated', order: 'desc', per_page: '20' });
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}; check token permissions or rate limit`);
  const result = await response.json();
  for (const repo of result.items) candidates.set(repo.full_name, {
    repo: repo.full_name, url: repo.html_url, description: repo.description,
    language: repo.language, stars: repo.stargazers_count, updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at, archived: repo.archived, license: repo.license?.spdx_id ?? null,
    topics: repo.topics, reviewStatus: 'unreviewed'
  });
}
const directory = resolve(process.env.DATA_DIR || './var', 'candidates');
await mkdir(directory, { recursive: true });
const filename = resolve(directory, `${new Date().toISOString().slice(0, 10)}.json`);
await writeFile(filename, JSON.stringify({ collectedAt: new Date().toISOString(), queries, candidates: [...candidates.values()] }, null, 2));
console.log(`Saved ${candidates.size} unreviewed candidates to ${filename}`);
