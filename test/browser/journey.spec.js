import { test, expect } from '@playwright/test';

test('discovery, filtering, full subscription journey and editor delivery', async ({ page, request }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('少一点搜索');
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.getByRole('link', { name: '项目库', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Agent / 工作流' }).click();
  await expect(page.locator('.project-card')).toHaveCount(2);
  await page.getByRole('searchbox', { name: '搜索项目' }).fill('doesnotexist');
  await expect(page.getByText('暂时没有匹配的项目')).toBeVisible();
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
  await page.getByRole('button', { name: '批准本期投递' }).click();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '生成本地周报' }).click();
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
  for (const route of ['/', '/library', '/weekly', '/projects/docling', '/subscribe', '/manage', '/privacy', '/method']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  await page.goto('/'); await expect(page.locator('.hero')).toBeVisible();
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
});
