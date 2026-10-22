// Shared by browser discovery and server delivery. No hidden score or popularity ranking.
export const languageLabels = { both: '不限语言', python: 'Python', typescript: 'TypeScript' };
export const deploymentLabels = { any: '不限部署方式', local: '本地运行', selfhost: '自托管', cloud: '托管服务' };

export function matchingProjects(projects, preferences) {
  return projects
    .filter(p => p.github?.archived !== true)
    .filter(p => p.topics.some(t => preferences.topics.includes(t)))
    .filter(p => preferences.language === 'both' || p.languages.includes(preferences.language))
    .filter(p => preferences.deployment === 'any' || p.deployment.includes(preferences.deployment))
    .map(p => ({ ...p, reasons: p.topics.filter(t => preferences.topics.includes(t)) }));
}

export function readFilters(params, topics) {
  const topic = params.get('topic');
  const language = params.get('language');
  const deployment = params.get('deployment');
  return {
    topic: topics.some(t => t.id === topic) ? topic : 'all',
    language: Object.hasOwn(languageLabels, language) ? language : 'both',
    deployment: Object.hasOwn(deploymentLabels, deployment) ? deployment : 'any',
    query: (params.get('q') || '').slice(0, 160)
  };
}

export function filterProjects(projects, filters, topics) {
  const preferences = { topics: filters.topic === 'all' ? topics.map(t => t.id) : [filters.topic], language: filters.language, deployment: filters.deployment };
  const words = filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return matchingProjects(projects, preferences).filter(p => {
    const text = [p.name, p.repo, p.summary, p.fit, p.kind, ...p.languages, ...p.topics.map(id => topics.find(t => t.id === id)?.name || id)].join(' ').toLowerCase();
    return words.every(word => text.includes(word));
  });
}

export function comparisonIds(value, projects) {
  return [...new Set(String(value || '').split(','))].filter(id => projects.some(p => p.id === id)).slice(0, 3);
}
