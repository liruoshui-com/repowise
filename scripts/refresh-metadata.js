import { readFile, writeFile, rename } from 'node:fs/promises';
import { fetchSnapshot } from '../server/github.js';

const file = new URL('../content/github-snapshots.json', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../content/catalog.json', import.meta.url), 'utf8'));
let result = { repositories: {} };
try { result = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let failures = 0;
for (const project of catalog.projects) {
  try {
    result.repositories[project.repo] = await fetchSnapshot(project.repo, { token: process.env.GITHUB_TOKEN });
    console.log(`Updated ${project.repo}`);
  } catch (error) {
    failures++;
    // Preserve the old timestamp and value; never make failed fetches look fresh.
    console.error(`Could not refresh ${project.repo}: ${error.name === 'TimeoutError' ? 'timeout' : 'GitHub unavailable'}. Previous snapshot preserved.`);
  }
}
const temporary = new URL('../content/github-snapshots.json.tmp', import.meta.url);
await writeFile(temporary, JSON.stringify(result, null, 2) + '\n');
await rename(temporary, file);
console.log(`Metadata refresh complete: ${catalog.projects.length - failures} updated, ${failures} failed. Review the diff before committing.`);
if (failures) process.exitCode = 1;
