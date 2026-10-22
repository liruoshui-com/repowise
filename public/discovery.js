import { readFilters, filterProjects, comparisonIds, languageLabels, deploymentLabels } from './catalog-tools.js';

export function createDiscovery({ getCatalog, e, icon, card, toast, navigate }) {
  let selected = [];
  try { selected = JSON.parse(localStorage.getItem('repowise-compare') || '[]'); } catch {}
  if (!Array.isArray(selected)) selected = [];
  const catalog = () => getCatalog();
  const validSelection = () => { selected = comparisonIds(selected.join(','), catalog().projects); return selected; };
  function persist() { try { localStorage.setItem('repowise-compare', JSON.stringify(selected)); } catch {} }
  const date = value => value ? String(value).slice(0, 10) : '未提供';
  const license = p => p.github?.license || '未识别，查看原文';
  const external = (url, label) => `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`;

  function snapshot(p) {
    const g = p.github;
    if (!g) return '<p class="detail-evidence">暂无 GitHub 数据快照，请以原仓库为准。</p>';
    const stale = Date.now() - Date.parse(g.fetchedAt) > 30 * 86400000;
    return `<section class="repo-facts"><div class="facts-heading"><h3>GitHub 仓库快照</h3><span class="pill ${g.archived || stale ? 'orange' : ''}">${g.archived ? '已归档' : stale ? '超过 30 天未刷新' : '未归档'}</span></div><dl><div><dt>许可证识别</dt><dd>${external(`https://github.com/${p.repo}`, license(p))}</dd></div><div><dt>最近发布</dt><dd>${g.latestRelease ? external(g.latestRelease.url, g.latestRelease.tag) : '未提供正式 Release'}</dd></div><div><dt>仓库最近推送</dt><dd>${e(date(g.pushedAt))}</dd></div><div><dt>关注数快照</dt><dd>☆ ${Number(g.stars).toLocaleString('en-US')}</dd></div></dl><p>采集于 ${e(date(g.fetchedAt))} · ${external(g.source, 'GitHub API')}<br>关注数不参与推荐排序；未归档不代表维护充分。许可证识别不替代阅读原文。</p></section>`;
  }
  function compareButton(p) {
    const checked = validSelection().includes(p.id);
    return `<button type="button" class="compare-toggle ${checked ? 'selected' : ''}" data-compare-toggle="${e(p.id)}" aria-label="${checked ? '移出比较' : '加入比较'} ${e(p.name)}" aria-pressed="${checked}">${checked ? '✓ 已加入比较' : '+ 加入比较'}</button>`;
  }
  function syncTray() {
    const ids = validSelection(); const tray = document.querySelector('#compare-tray');
    if (!tray) return;
    tray.hidden = !ids.length || location.pathname === '/compare';
    tray.innerHTML = `<div><strong>比较清单 <span class="mono">${ids.length} / 3</span></strong><span>${ids.map(id => e(catalog().projects.find(p => p.id === id).name)).join(' · ')}</span></div><div class="actions"><button class="button small" data-clear-compare>清空</button><a class="button dark small" href="/compare?ids=${ids.join(',')}">并排比较 →</a></div>`;
    document.body.classList.toggle('has-compare-tray', !tray.hidden);
    document.querySelectorAll('[data-compare-toggle]').forEach(button => {
      const checked = ids.includes(button.dataset.compareToggle);
      const p = catalog().projects.find(p => p.id === button.dataset.compareToggle);
      button.classList.toggle('selected', checked); button.setAttribute('aria-pressed', checked);
      button.setAttribute('aria-label', `${checked ? '移出比较' : '加入比较'} ${p.name}`);
      button.textContent = checked ? '✓ 已加入比较' : '+ 加入比较';
    });
  }
  const options = (labels, selected) => Object.entries(labels).map(([id, label]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${e(label)}</option>`).join('');
  function library() {
    const filters = readFilters(new URLSearchParams(location.search), catalog().topics);
    return `<div class="container bottom-space"><div class="page-top"><div class="eyebrow"><span class="dot"></span>FIND YOUR NEXT BUILDING BLOCK</div><h1>先说需求，再选工具。</h1><p>按实际场景、应用语言与部署方式缩小候选范围，再把工具放在一起比较。无需注册即可开始。</p></div><div class="discovery-panel"><div class="discovery-title"><span class="mono">01 / YOUR CONTEXT</span><span class="pill green">按条件筛选 · 不按热度排序</span></div><div class="toolbar"><div class="filters" aria-label="按主题筛选"><button class="filter ${filters.topic === 'all' ? 'selected' : ''}" data-filter="all">全部项目</button>${catalog().topics.map(t => `<button class="filter ${filters.topic === t.id ? 'selected' : ''}" data-filter="${t.id}">${e(t.short)}</button>`).join('')}</div></div><div class="discovery-fields"><label>接入语言<select id="filter-language" aria-label="接入语言">${options(languageLabels, filters.language)}</select></label><label>部署方式<select id="filter-deployment" aria-label="部署方式">${options(deploymentLabels, filters.deployment)}</select></label><label class="search">搜索项目<input type="search" id="search" value="${e(filters.query)}" maxlength="160" placeholder="名称、用途或关键词…" autocomplete="off"></label></div><p class="filter-explanation">“本地运行”描述工具的运行位置，不表示无需联网、模型或外部 API。</p></div><div id="project-results" aria-live="polite"></div><div class="note-box">同一类工具适合并排比较；不同环节的工具可能互补。这里不会给出一个掩盖取舍的综合分数。</div></div>`;
  }
  function refreshLibrary(updateUrl = false) {
    const filters = readFilters(new URLSearchParams(location.search), catalog().topics);
    const languageInput = document.querySelector('#filter-language');
    if (!languageInput) return;
    filters.language = languageInput.value;
    filters.deployment = document.querySelector('#filter-deployment').value;
    filters.query = document.querySelector('#search').value;
    const params = new URLSearchParams();
    if (filters.topic !== 'all') params.set('topic', filters.topic);
    if (filters.language !== 'both') params.set('language', filters.language);
    if (filters.deployment !== 'any') params.set('deployment', filters.deployment);
    if (filters.query) params.set('q', filters.query);
    if (updateUrl) history.replaceState(null, '', `/library${params.size ? '?' + params.toString() : ''}`);
    const projects = filterProjects(catalog().projects, filters, catalog().topics);
    const labels = [filters.topic === 'all' ? '全部主题' : catalog().topics.find(t => t.id === filters.topic).name, languageLabels[filters.language], deploymentLabels[filters.deployment]];
    params.delete('q');
    params.set('topic', filters.topic);
    document.querySelector('#project-results').innerHTML = `<div class="match-heading"><div><span class="mono">02 / YOUR SHORTLIST</span><p class="result-count">${projects.length} 个候选 · ${labels.map(e).join(' / ')}</p></div><a class="text-link" href="/subscribe?${e(params.toString())}">按这些偏好订阅 ↗</a></div><div class="project-grid">${projects.length ? projects.map(card).join('') : '<div class="empty"><h3>暂时没有符合全部条件的项目</h3><p>我们保留你的条件。可以主动放宽语言或部署方式，再看看。</p><button class="button small" data-reset-filters>重置筛选</button></div>'}</div>`;
    syncTray();
  }
  function comparison() {
    const requested = new URLSearchParams(location.search).get('ids');
    const ids = comparisonIds(requested === null ? validSelection().join(',') : requested, catalog().projects);
    const projects = ids.map(id => catalog().projects.find(p => p.id === id));
    const intro = `<div class="page-top"><div class="eyebrow"><span class="dot"></span>TRADE-OFFS, SIDE BY SIDE</div><h1>把取舍，放在一起看。</h1><p>最多比较三个项目。功能摘要来自官方资料，适用建议属于编辑判断；这里没有性能实测排名。</p><a href="/library" class="text-link">← 回到项目库添加候选</a></div>`;
    if (!projects.length) return `<div class="container bottom-space">${intro}<div class="empty"><h3>还没有可比较的项目</h3><p>到项目库点击“加入比较”，也可以从有效的分享链接打开。</p><a class="button dark" href="/library">选择候选项目 →</a></div></div>`;
    const kinds = new Set(projects.map(p => p.kind));
    const row = (label, value, html = false) => `<tr><th scope="row">${label}</th>${projects.map(p => `<td>${html ? value(p) : e(value(p))}</td>`).join('')}</tr>`;
    const rows = [
      row('在流程中的角色', p => p.kind || '未分类'), row('解决什么问题', p => p.summary),
      row('适用条件', p => p.fit), row('接入语言', p => p.languages.map(l => languageLabels[l]).join(' / ')),
      row('部署路径', p => p.deployment.map(d => deploymentLabels[d]).join(' / ')), row('使用代价', p => p.tradeoff),
      row('怎么判断是否值得换', p => p.comparison), row('先做一个小试验', p => p.nextStep),
      row('许可证识别', p => license(p)), row('验证依据', p => `${p.evidence} · ${p.verifiedAt} · 未安装实测`),
      row('来源', p => external(p.sources[0].url, '官方资料'), true)
    ].join('');
    return `<div class="container bottom-space">${intro}<div class="comparison-actions"><span class="pill">${projects.length} / 3 个项目</span><button class="button small" data-copy-comparison="${ids.join(',')}">复制分享链接 ↗</button><button class="button small" data-export-comparison="${ids.join(',')}">导出 Markdown ↓</button></div><label id="share-fallback" class="share-fallback" hidden>分享链接<input readonly aria-label="分享链接"></label>${kinds.size > 1 ? '<div class="note-box">这些项目承担不同角色，可能互补，并不都能相互替换。请先看“在流程中的角色”。</div>' : '<div class="note-box">这些项目属于同类候选，但能力边界仍可能不同。用同一个真实任务核对差异。</div>'}<div class="comparison-scroll" role="region" aria-label="项目比较表" tabindex="0"><table class="comparison-table"><caption class="visually-hidden">项目适用条件与取舍比较</caption><thead><tr><th scope="col">比较维度</th>${projects.map(p => `<th scope="col"><div class="project-top">${icon(p)}<a href="/projects/${e(p.id)}">${e(p.name)} ↗</a></div><button class="text-button" data-remove-comparison="${p.id}" data-current-ids="${ids.join(',')}">移除此项</button></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function archive() {
    return `<div class="container bottom-space"><div class="page-top"><div class="eyebrow"><span class="dot"></span>THE READING SHELF</div><h1>值得回来的每一期。</h1><p>按专题积累，选型时再回来。公开刊物也可以通过 RSS 阅读，不需要留下邮箱。</p><a class="button small" href="/feed.xml" data-native>订阅全部 RSS ↗</a></div><div class="archive-layout"><div>${catalog().issues.map(issue => `<article class="archive-card"><div class="archive-number mono">${e(issue.id)}</div><div><span class="pill orange">${e(issue.label)}</span><h2><a href="/weekly?issue=${e(issue.id)}">${e(issue.title)}</a></h2><p>${e(issue.subtitle)}</p><div class="archive-meta"><span>${e(issue.date)} · ${issue.projectIds.length} 个项目</span><a class="text-link" href="/weekly?issue=${e(issue.id)}">阅读本期 →</a></div></div></article>`).join('')}</div><aside class="rss-panel"><span class="mono">READ IT YOUR WAY</span><h3>只关注一个方向？</h3><p>主题 RSS 收录包含该主题项目的完整刊物。它不会应用你的个人语言或部署偏好。</p>${catalog().topics.map(t => `<a class="rss-link" data-native href="/feed.xml?topic=${t.id}">${e(t.name)} <span>RSS ↗</span></a>`).join('')}<p class="detail-evidence">需要个人偏好筛选？<br><a class="text-link" href="/subscribe">选择邮件订阅 →</a></p></aside></div></div>`;
  }
  async function handleClick(button) {
    if (button.dataset.compareToggle) {
      validSelection(); const id = button.dataset.compareToggle;
      if (selected.includes(id)) selected = selected.filter(x => x !== id);
      else if (selected.length < 3) selected.push(id);
      else { toast('最多比较三个项目，请先移除一个候选'); return true; }
      persist(); syncTray(); return true;
    }
    if (button.hasAttribute('data-clear-compare')) { selected = []; persist(); syncTray(); return true; }
    if (button.hasAttribute('data-reset-filters')) { navigate('/library'); return true; }
    if (button.dataset.removeComparison) {
      const ids = comparisonIds(button.dataset.currentIds, catalog().projects).filter(id => id !== button.dataset.removeComparison);
      selected = ids; persist(); navigate(`/compare?ids=${ids.join(',')}`); return true;
    }
    if (button.dataset.copyComparison) {
      const url = `${location.origin}/compare?ids=${comparisonIds(button.dataset.copyComparison, catalog().projects).join(',')}`;
      try { await navigator.clipboard.writeText(url); toast('比较链接已复制'); }
      catch { const field = document.querySelector('#share-fallback'); field.hidden = false; field.querySelector('input').value = url; field.querySelector('input').select(); toast('可复制下方分享链接'); }
      return true;
    }
    if (button.dataset.exportComparison) {
      const projects = comparisonIds(button.dataset.exportComparison, catalog().projects).map(id => catalog().projects.find(p => p.id === id));
      const text = '# RepoWise 选型比较\n\n基于官方资料与编辑判断，未安装实测。\n\n' + projects.map(p => `## ${p.name}\n\n- 角色：${p.kind}\n- 适合：${p.fit}\n- 使用代价：${p.tradeoff}\n- 接入语言：${p.languages.join(' / ')}\n- 部署：${p.deployment.map(d => deploymentLabels[d]).join(' / ')}\n- 选择建议：${p.comparison}\n- 下一步：${p.nextStep}\n- 核查：${p.verifiedAt} / ${p.evidence}\n- 来源：${p.sources.map(s => `[${s.title}](${s.url})`).join('、')}`).join('\n\n');
      const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a'); link.href = blobUrl; link.download = 'repowise-comparison.md'; link.dataset.native = ''; link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000); toast('选型笔记已导出'); return true;
    }
    return false;
  }
  return { library, refreshLibrary, comparison, archive, snapshot, compareButton, syncTray, handleClick };
}
