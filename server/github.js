// Read public GitHub repository metadata. Never execute code from a candidate repository.
export async function fetchSnapshot(repo, { token, fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Invalid repository name');
  const base = `https://api.github.com/repos/${repo}`;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'RepoWise/0.2', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  async function get(url, optional = false) {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20000) });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return response.json();
  }
  const data = await get(base);
  const release = await get(`${base}/releases/latest`, true);
  const license = data.license?.spdx_id;
  return {
    repo, canonicalRepo: data.full_name, fetchedAt: now(), source: base,
    stars: data.stargazers_count, forks: data.forks_count,
    archived: data.archived, pushedAt: data.pushed_at,
    license: license && !['NOASSERTION', 'OTHER'].includes(license) ? license : null,
    latestRelease: release ? { tag: release.tag_name, publishedAt: release.published_at, url: release.html_url } : null
  };
}
