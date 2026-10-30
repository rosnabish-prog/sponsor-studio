import type { StudioData, Fixture, Sponsor, TagAttribute, TaskSummary } from './models';

export type ScreenId = 'loading' | 'login' | 'workspace' | 'dashboard' | 'tasks' | 'labeling' | 'studio' | 'sponsors' | 'attributes' | 'users' | 'reports';

export interface ScreenContext {
  user?: { name: string; role: 'owner' | 'admin' | 'analyst' | 'viewer' };
  taskId?: string;
  changeRequired?: boolean;
  workspaces?: {id:string;name:string;slug:string}[];
  workspaceName?: string;
  data?: StudioData;
  viewerId?: string;
  fixtures?: Fixture[];
  badges?: Record<string, string>;
  fixtureSyncLabel?: string;
  fixtureRefreshing?: boolean;
  fixtureDay?: string;
  taskFilter?: string;
  studio?: StudioScreenModel;
  reports?: ReportsScreenModel;
}

export interface ReportsScreenModel {
  tasks: { id: string; number: string; name: string }[];
  selectedId?: string;
  selectedTask?: TaskSummary;
  data: StudioData;
  focusId: string;
  fixtures: Fixture[];
  badges: Record<string, string>;
  visibleTasks: TaskSummary[];
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
  seekStep: number;
  playbackRate: number;
  videoDimensions: string;
  videoError: string;
  playing: boolean;
  railTitle: string;
  railHint: string;
  submitted: { sponsors: boolean; context: boolean };
  task: TaskSummary;
  sponsors: Sponsor[];
  events: TagAttribute[];
  cameras: TagAttribute[];
  editingInterval?: {key:'sponsors'|'events'|'cameras';id:string;start:number;end:number};
}

/** Synchronous commit so annotation handlers can immediately access mounted DOM. */
export type StudioMount = (screen: ScreenId, context: ScreenContext, afterCommit?: () => void) => void;
