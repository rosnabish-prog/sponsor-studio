import type { ReactNode } from 'react';
import type { ScreenContext, ScreenId } from '../types/screen';

function Icon({ name }: { name: string }) {
  return <svg className="ic"><use href={`#i-${name}`} /></svg>;
}

function BrandLockup({ focused = false }: { focused?: boolean }) {
  return (
    <div className="identity-lockup">
      <button
        type="button"
        className={`${focused ? 'focusbrand' : 'ops-brand'} brand-home`}
        onClick={() => window.navigate?.('dashboard')}
        aria-label="Go to Sponsor Studio dashboard"
        title="Back to dashboard"
      >
        <img src="assets/mc26-wordmark.svg" alt={focused ? 'Messi Cup 26' : 'MESSI CUP 26'} />
      </button>
      <span className="powered-by">
        <span>POWERED BY</span>
        <img src="assets/seebot-wordmark-orange-20261029.svg" alt="Seebot" loading="eager" />
      </span>
    </div>
  );
}

const basicNav = [
  { id: 'dashboard', label: 'Overview', icon: 'grid' },
  { id: 'tasks', label: 'Matches', icon: 'video' },
  { id: 'reports', label: 'Insights', icon: 'chart' },
] as const;
const adminNav = [
  { id: 'sponsors', label: 'Sponsors', icon: 'tags' },
  { id: 'attributes', label: 'Attributes', icon: 'settings' },
  { id: 'users', label: 'Team', icon: 'users' },
] as const;

export function AppShell({ screen, context, children }: {
  screen: Exclude<ScreenId, 'login'|'workspace'|'loading'>;
  context: ScreenContext;
  children: ReactNode;
}) {
  const user = context.user;
  if (!user) throw new Error('Authenticated screen is missing its user');

  if (screen === 'studio') {
    return (
      <div className="app app-focus">
        <header className="focusbar">
          <BrandLockup focused />
          <div className="focusactions">
            <button className="button ghost" onClick={() => window.showReport?.(context.taskId ?? '')}>
              <Icon name="chart" /> INSIGHTS
            </button>
            <button className="button ghost" onClick={() => window.logout?.()}>SIGN OUT</button>
          </div>
        </header>
        <main className="focuscontent">{children}</main>
      </div>
    );
  }

  const nav = user.role === 'admin' ? [...basicNav, ...adminNav] : [...basicNav];
  return (
    <div className="app">
      <header className="ops-header">
        <div className="ops-head-first">
          <BrandLockup />
          <div className="ops-year">● 2026 TOURNAMENT <i /> OCT 25 – NOV 1</div>
          <div className="ops-user">
            <span>{user.name} <small>/ {user.role.toUpperCase()}</small></span>
            {context.workspaceName && (context.workspaces?.length ?? 0) > 1
              ? <button onClick={() => window.showWorkspaceSwitcher?.()} aria-label="Switch workspace">{context.workspaceName}</button>
              : <span className="ops-workspace-name" aria-label="Current workspace">{context.workspaceName}</span>}
            <button onClick={() => window.logout?.()} aria-label="Sign out"><Icon name="logout" /> SIGN OUT</button>
          </div>
        </div>
        <nav className="ops-nav" aria-label="Main navigation">
          <div className="ops-nav-items">
            {nav.map(item => (
              <button key={item.id} className={`nav ${screen === item.id ? 'active' : ''}`} onClick={() => window.navigate?.(item.id)}>
                <Icon name={item.icon} />{item.label}
              </button>
            ))}
          </div>
          <span className="ops-global-tag">16 CLUBS. ONE GLOBAL STAGE.</span>
        </nav>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

declare global {
  interface Window {
    navigate?: (view: ScreenId) => void;
    showReport?: (taskId: string) => void;
    logout?: () => void;
    showWorkspaceSwitcher?: () => void;
  }
}
