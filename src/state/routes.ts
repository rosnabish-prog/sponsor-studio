/** Durable client-side routes. Hash paths also survive refreshes on static hosts. */
export type ProductView = 'dashboard' | 'tasks' | 'studio' | 'sponsors' | 'attributes' | 'users' | 'reports';

const slugs: Record<ProductView, string> = {
  dashboard: 'overview', tasks: 'matches', studio: 'studio', sponsors: 'sponsors',
  attributes: 'attributes', users: 'team', reports: 'insights',
};

export function readStudioRoute(): { view: ProductView; taskId: string } {
  const [slug = '', encodedId = ''] = window.location.hash.replace(/^#\/?/, '').split('/');
  const view = (Object.keys(slugs) as ProductView[]).find(key => slugs[key] === slug) || 'dashboard';
  let taskId = '';
  try { taskId = decodeURIComponent(encodedId); } catch { /* Ignore malformed URLs. */ }
  return { view, taskId: view === 'studio' || view === 'reports' ? taskId : '' };
}

export function writeStudioRoute(view: ProductView, taskId = '', replace = false) {
  const suffix = (view === 'studio' || view === 'reports') && taskId ? `/${encodeURIComponent(taskId)}` : '';
  const hash = `#/${slugs[view]}${suffix}`;
  if (window.location.hash === hash) return;
  if (replace) window.history.replaceState(null, '', hash);
  else window.history.pushState(null, '', hash);
}
