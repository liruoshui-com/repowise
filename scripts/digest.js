const base = process.env.BASE_URL;
const token = process.env.ADMIN_TOKEN;
if (!base || !token) throw new Error('Set BASE_URL and ADMIN_TOKEN');
const url = new URL(base);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Remote digest requests require HTTPS');
const args = process.argv.slice(2);
const requestedIssue = args.find(x => !x.startsWith('--'));
const catalogResponse = await fetch(`${base}/api/catalog`, { signal: AbortSignal.timeout(15000) });
if (!catalogResponse.ok) throw new Error('Cannot load catalog');
const catalog = await catalogResponse.json();
const issueId = requestedIssue || catalog.issues[0]?.id;
if (!issueId) throw new Error('No published issue');
if (!args.includes('--send')) {
  console.log(`Dry run: issue ${issueId}, mode ${catalog.mailMode}. Add --send to deliver an already approved issue.`);
  process.exit(0);
}
const response = await fetch(`${base}/api/admin/send`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ issueId }), signal: AbortSignal.timeout(300000)
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Digest failed');
console.log(JSON.stringify(result));
