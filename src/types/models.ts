export interface Sponsor {
  id: string;
  name: string;
  logo?: string;
  color?: string;
  logoTrimmed?: boolean;
}

export interface SponsorGroup {
  id: string;
  name: string;
  description?: string;
  sponsors: Sponsor[];
}

export interface TagAttribute {
  id: string;
  name: string;
  highValue?: boolean;
  kind?: string;
}

export interface TagGroup {
  id: string;
  name: string;
  items: TagAttribute[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'analyst';
  password: string;
}

export interface AnnotationBase {
  id: string;
  start: number;
  end: number | null;
  createdBy: string;
  createdAt: string;
}

export interface SponsorAnnotation extends AnnotationBase {
  sponsorId: string;
  placement?: string | null;
  quality?: string | null;
}

export interface EventAnnotation extends AnnotationBase {
  eventId: string;
  kind: 'range' | 'point';
}

export interface CameraAnnotation extends AnnotationBase {
  cameraId: string;
}

export interface TaskSummary {
  id: string;
  name: string;
  number: string;
  date?: string;
  demo?: boolean;
  duration: number;
  fixtureId?: string;
  homeTeam?: string;
  awayTeam?: string;
  sponsorGroupIds: string[];
  eventGroupIds: string[];
  cameraGroupIds: string[];
  sponsorAnalystId: string;
  contextAnalystId: string;
  sponsors: SponsorAnnotation[];
  events: EventAnnotation[];
  cameras: CameraAnnotation[];
  submitted: { sponsors: boolean; context: boolean };
  videoType?: 'none' | 'https' | 'ftp';
  videoUrl?: string;
  videoName?: string;
  videoSize?: number;
  videoMime?: string;
  observedTime?: number;
  periods?: { firstEnd: number; secondStart: number } | null;
  createdAt?: string;
}

export interface Fixture {
  id: string;
  date: string;
  home: string;
  away: string;
  time?: string;
  group?: string;
  stage?: string;
  venue?: string;
  score?: string;
  status?: string;
  order?: number;
}

export interface StudioData {
  users: TeamMember[];
  sponsorGroups: SponsorGroup[];
  eventGroups: TagGroup[];
  cameraGroups: TagGroup[];
  tasks: TaskSummary[];
}
