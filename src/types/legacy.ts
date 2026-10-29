import type { StudioData, Fixture } from './models';

export type ScreenId = 'login' | 'dashboard' | 'tasks' | 'studio' | 'sponsors' | 'attributes' | 'users' | 'reports';

export interface ScreenContext {
  user?: { name: string; role: 'admin' | 'analyst' };
  taskId?: string;
  forgot?: boolean;
  data?: StudioData;
  viewerId?: string;
  fixtures?: Fixture[];
  badges?: Record<string, string>;
  fixtureSyncLabel?: string;
  fixtureDay?: string;
  taskFilter?: string;
  studio?: StudioScreenModel;
  reports?: ReportsScreenModel;
}

export interface ReportsScreenModel {
  tasks: { id: string; number: string; name: string }[];
  selectedId?: string;
  matchMarkup: string;
  analyticsMarkup: string;
  tournamentMarkup: string;
}

export interface StudioScreenModel {
  id: string;
  number: string;
  name: string;
  date?: string;
  duration: number;
  videoName?: string;
  videoType?: string;
  videoSrc?: string | null;
  isLocalVideo: boolean;
  status: 'ready' | 'progress' | 'done';
  sponsorAnalyst: string;
  contextAnalyst: string;
  canSponsor: boolean;
  canContext: boolean;
  selectedTab: 'all' | 'sponsors' | 'events' | 'cameras';
  tick: number;
  sponsorCount: number;
  logCount: number;
  cameraLabel: string;
  railTitle: string;
  railHint: string;
  submitted: { sponsors: boolean; context: boolean };
  controlsMarkup: string;
  timelineMarkup: string;
  logsMarkup: string;
  railMarkup: string;
}

/** Synchronous commit so annotation handlers can immediately access mounted DOM. */
export type LegacyMount = (screen: ScreenId, context: ScreenContext, afterCommit?: () => void) => void;
