import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, readFilters, comparisonIds } from '../public/catalog-tools.js';
import { loadCatalog, matchProjects, validatePreferences } from '../server/content.js';
import { rssFeed } from '../server/feed.js';
import { fetchSnapshot } from '../server/github.js';

test('guest discovery uses the same constraints as newsletter matching', () => {
  const c = loadCatalog();
  const filters = readFilters(new URLSearchParams('topic=agents&language=typescript&deployment=selfhost'), c.topics);
  const visible = filterProjects(c.projects, filters, c.topics);
  assert.deepEqual(visible.map(p => p.id), ['ai-sdk']);
  assert.deepEqual(visible, matchProjects(c.projects, { topics: ['agents'], language: 'typescript', deployment: 'selfhost' }));
  const stricter = { topic: 'knowledge', language: 'typescript', deployment: 'local', query: '' };
  assert.deepEqual(filterProjects(c.projects, stricter, c.topics), []);
  assert.equal(filterProjects(c.projects, { ...filters, query: 'Vercel TypeScript' }, c.topics).length, 1);
  assert.equal(filterProjects(c.projects, { ...filters, query: 'Vercel no-match' }, c.topics).length, 0);
});

test('invalid query input is normalized and comparison selection is bounded and deduplicated', () => {
  const c = loadCatalog();
  assert.deepEqual(readFilters(new URLSearchParams('topic=bad&language=__proto__&deployment=constructor'), c.topics), { topic: 'all', language: 'both', deployment: 'any', query: '' });
  assert.deepEqual(comparisonIds('docling,docling,bad,ragas,ai-sdk,haystack', c.projects), ['docling', 'ragas', 'ai-sdk']);
  assert.deepEqual(comparisonIds('<script>,,', c.projects), []);
  assert.throws(() => validatePreferences({ topics: 'agents', language: 'both', deployment: 'any' }, c), /主题/);
});

test('archived snapshots are excluded and popularity does not change editorial order', () => {
  const projects = [
    { id: 'low-stars', topics: ['agents'], languages: ['python'], deployment: ['local'], github: { stars: 2, archived: false } },
    { id: 'high-stars', topics: ['agents'], languages: ['python'], deployment: ['local'], github: { stars: 99999, archived: false } },
    { id: 'archived', topics: ['agents'], languages: ['python'], deployment: ['local'], github: { stars: 500000, archived: true } }
  ];
  assert.deepEqual(matchProjects(projects, { topics: ['agents'], language: 'python', deployment: 'local' }).map(p => p.id), ['low-stars', 'high-stars']);
});

test('RSS escapes editable text, dates use a fixed timezone and IDs are stable', () => {
  const c = loadCatalog();
  c.issues[0].title = 'A & B <test> "quote"';
  const output = rssFeed(c, 'https://example.com');
  assert.match(output, /A &amp; B &lt;test&gt; &quot;quote&quot;/);
  assert.match(output, /Thu, 22 Oct 2026 01:00:00 GMT/);
  assert.match(output, /<guid isPermaLink="true">https:\/\/example.com\/weekly\?issue=002<\/guid>/);
  assert.doesNotMatch(output, /<test>/);
});

test('snapshot fetching records actual provenance and treats missing releases as missing', async () => {
  const calls = [];
  const snapshot = await fetchSnapshot('owner/repo', {
    now: () => '2026-10-22T08:00:00.000Z',
    fetchImpl: async (url, options) => {
      calls.push({ url, headers: options.headers });
      if (url.endsWith('/releases/latest')) return { ok: false, status: 404 };
      return { ok: true, json: async () => ({ full_name: 'owner/repo', stargazers_count: 12, forks_count: 2, archived: false, pushed_at: '2026-10-20T00:00:00Z', license: { spdx_id: 'NOASSERTION' } }) };
    }
  });
  assert.equal(snapshot.license, null); assert.equal(snapshot.latestRelease, null);
  assert.equal(snapshot.fetchedAt, '2026-10-22T08:00:00.000Z');
  assert.equal(snapshot.source, 'https://api.github.com/repos/owner/repo');
  assert.equal(calls.length, 2); assert.equal(calls[0].headers.Authorization, undefined);
  await assert.rejects(fetchSnapshot('../evil'), /Invalid repository/);
  await assert.rejects(fetchSnapshot('owner/repo', { fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});
