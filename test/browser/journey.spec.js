import { test, expect } from '@playwright/test';

test('discovery, filtering, full subscription journey and editor delivery', async ({ page, request }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('少一点搜索');
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '项目库', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(10);
  await page.screenshot({ path: 'test-results/library-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Agent / 工作流' }).click();
  await expect(page.locator('.project-card')).toHaveCount(5);
  await page.getByRole('searchbox', { name: '搜索项目' }).fill('doesnotexist');
  await expect(page.getByText('暂时没有符合全部条件的项目')).toBeVisible();
  await page.goto('/weekly');
  await expect(page.locator('.article-step')).toHaveCount(4);
  await page.goto('/subscribe');
  await page.getByLabel('邮箱地址').fill('browser@example.com');
  await page.locator('input[name=consent]').check();
  await page.getByRole('button', { name: '发送邮箱确认链接' }).click();
  await expect(page.locator('.form-message')).toContainText('本地');
  await page.getByRole('link', { name: '打开本地邮件箱，完成确认' }).click();
  await page.getByRole('link', { name: '打开确认链接' }).first().click();
  await page.getByRole('button', { name: '确认订阅' }).click();
  await expect(page.getByText('browser@example.com', { exact: true })).toBeVisible();
  await page.goto('/projects/docling');
  await page.getByRole('button', { name: '加入关注列表' }).click();
  await expect(page.getByRole('button', { name: '已关注' })).toBeVisible();
  await page.getByRole('button', { name: '已使用', exact: true }).click();
  await expect(page.getByRole('button', { name: '已使用', exact: true })).toHaveClass('selected');
  await page.goto('/manage');
  await expect(page.getByRole('link', { name: 'Docling' })).toBeVisible();
  await page.getByLabel('部署偏好').selectOption('selfhost');
  await page.getByRole('button', { name: '保存订阅偏好' }).click();
  await expect(page.locator('.form-message')).toContainText('已保存');
  await page.reload(); await expect(page.getByLabel('部署偏好')).toHaveValue('selfhost');
  await page.goto('/admin');
  await page.getByLabel('编辑密钥').fill('browser-test-only-secret-at-least-32-characters');
  await page.getByRole('button', { name: '打开工作台' }).click();
  await page.locator('[data-preview="001"]').click();
  await expect(page.locator('#preview-001')).toContainText('预计投递 1 位');
  await page.locator('[data-approve="001"]').click();
  page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-send="001"]').click();
  await expect(page.locator('table')).toContainText(['Docling', 'digest']);
  const mails = await (await request.get('/api/dev/mail')).json();
  expect(mails.filter(m => m.subject.startsWith('RepoWise #'))).toHaveLength(1);
  await page.goto('/manage');
  await page.getByRole('button', { name: '停止订阅' }).click();
  await expect(page.getByRole('heading', { name: '已停止订阅。' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile routes remain usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/library', '/weekly', '/projects/docling', '/subscribe', '/manage', '/privacy', '/method', '/archive', '/compare?ids=llamaindex,haystack,pydantic-ai']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  await page.goto('/'); await expect(page.locator('.hero')).toBeVisible();
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
});

test('guest filters survive reload and carry through to subscription', async ({ page }) => {
  await page.goto('/library');
  await page.getByRole('link', { name: '按这些偏好订阅' }).click();
  for (const topic of ['knowledge', 'agents', 'shipping']) await expect(page.locator(`input[value="${topic}"]`)).toBeChecked();
  await page.goto('/library');
  await page.getByRole('button', { name: 'Agent / 工作流' }).click();
  await page.getByLabel('接入语言').selectOption('typescript');
  await page.getByLabel('部署方式', { exact: true }).selectOption('selfhost');
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.locator('.project-card')).toContainText('Vercel AI SDK');
  await page.reload();
  await expect(page.getByLabel('接入语言')).toHaveValue('typescript');
  await expect(page.getByLabel('部署方式', { exact: true })).toHaveValue('selfhost');
  await page.getByRole('link', { name: '按这些偏好订阅' }).click();
  await expect(page.locator('input[value="agents"]')).toBeChecked();
  await expect(page.locator('input[value="knowledge"]')).not.toBeChecked();
  await expect(page.getByLabel('主要开发语言')).toHaveValue('typescript');
  await expect(page.getByLabel('部署偏好')).toHaveValue('selfhost');
  await page.goto('/library?topic=knowledge&language=typescript&deployment=local');
  await expect(page.getByText('暂时没有符合全部条件的项目')).toBeVisible();
});

test('comparison is bounded, shareable, removable and exports a source-backed note', async ({ page }) => {
  await page.goto('/library');
  for (const name of ['Docling', 'LlamaIndex', 'Qdrant']) await page.getByRole('button', { name: `加入比较 ${name}`, exact: true }).click();
  await page.getByRole('button', { name: '加入比较 Ragas', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('最多比较三个');
  await page.reload();
  await expect(page.getByRole('button', { name: '移出比较 Docling', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '并排比较' }).click();
  await expect(page.locator('.comparison-table thead th')).toHaveCount(4);
  await expect(page.getByText('这些项目承担不同角色', { exact: false })).toBeVisible();
  await page.locator('[data-remove-comparison="docling"]').click();
  await expect(page).toHaveURL(/ids=llamaindex,qdrant/);
  await expect(page.locator('.comparison-table thead th')).toHaveCount(3);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Markdown' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('repowise-comparison.md');
  const stream = await download.createReadStream(); let text = '';
  for await (const chunk of stream) text += chunk.toString('utf8');
  expect(text).toContain('LlamaIndex'); expect(text).toContain('https://github.com/run-llama/llama_index');
  await page.goto('/compare?ids=llamaindex,haystack');
  await page.screenshot({ path: 'test-results/comparison-desktop.png', fullPage: true });
  await expect(page.locator('.comparison-table')).toContainText('Haystack');
  await page.goto('/compare?ids=bad,%3Cscript%3E');
  await expect(page.getByText('还没有可比较的项目')).toBeVisible();
});

test('archives preserve old issues and RSS navigation reaches a parseable XML feed', async ({ page }) => {
  await page.goto('/archive');
  await expect(page.locator('.archive-card')).toHaveCount(2);
  await page.getByRole('link', { name: '从文档，到可用的 AI 知识库', exact: true }).click();
  await expect(page).toHaveURL(/issue=001/);
  await expect(page.locator('h1')).toContainText('从文档');
  await page.goto('/weekly?issue=not-real');
  await expect(page.locator('h1')).toContainText('没有找到这一期');
  await page.goto('/projects/haystack');
  await expect(page.getByRole('heading', { name: 'GitHub 仓库快照' })).toBeVisible();
  const parsed = await page.evaluate(async () => {
    const text = await (await fetch('/feed.xml')).text();
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    return { errors: doc.querySelectorAll('parsererror').length, items: doc.querySelectorAll('item').length };
  });
  expect(parsed).toEqual({ errors: 0, items: 2 });
  await page.goto('/archive');
  const responseEvent = page.waitForResponse(r => r.url().endsWith('/feed.xml') && r.request().isNavigationRequest());
  await page.getByRole('link', { name: '订阅全部 RSS' }).click();
  expect((await responseEvent).headers()['content-type']).toContain('application/rss+xml');
});
