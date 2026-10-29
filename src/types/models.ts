export interface Sponsor {
  id: string;
  name: string;
  logo?: string;
  color?: string;
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
  sponsors: { end: number | null }[];
  events: { end: number | null }[];
  cameras: { end: number | null }[];
  submitted?: { sponsors: boolean; context: boolean };
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
