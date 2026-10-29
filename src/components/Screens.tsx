import type { ScreenContext, ScreenId } from '../types/screen';
import { AppShell } from './AppShell';
import { LoginScreen } from './LoginScreen';
import { WorkspaceScreen } from './WorkspaceScreen';
import { DashboardScreen, MatchesScreen } from './MatchScreens';
import { SponsorLibraryScreen, AttributesScreen, TeamScreen } from './AdminScreens';
import { AnnotationStudioScreen } from './AnnotationStudioScreen';
import { InsightsScreen } from './InsightsScreen';

/** All eight product routes now have native JSX screen components. */
export function Screen({ id, context }: { id: ScreenId; context: ScreenContext }) {
  if (id === 'loading') return <div className="session-loading" role="status" aria-live="polite"><div className="session-loading-mark">MC26 <span>·</span> SPONSOR STUDIO</div><div className="session-loading-bar" /><p>Restoring your workspace…</p></div>;
  if (id === 'login') return <LoginScreen changeRequired={context.changeRequired ?? false} />;
  if (id === 'workspace') return <WorkspaceScreen workspaces={context.workspaces ?? []} />;
  const data = context.data;
  let content: React.ReactNode;
  switch (id) {
    case 'dashboard': content = <DashboardScreen context={context} />; break;
    case 'tasks': content = <MatchesScreen context={context} />; break;
    case 'studio': content = context.studio && <AnnotationStudioScreen model={context.studio} isAdmin={context.user?.role === 'admin'} />; break;
    case 'sponsors': content = data && <SponsorLibraryScreen data={data} />; break;
    case 'attributes': content = data && <AttributesScreen data={data} />; break;
    case 'users': content = data && <TeamScreen data={data} />; break;
    case 'reports': content = context.reports && <InsightsScreen model={context.reports} />; break;
  }
  return <AppShell screen={id} context={context}>{content}</AppShell>;
}
