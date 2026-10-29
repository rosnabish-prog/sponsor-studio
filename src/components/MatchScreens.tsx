import type { ScreenContext } from '../types/screen';
import type { Fixture, StudioData, TaskSummary } from '../types/models';
import { formatTimestamp } from '../domain/intervals';

function Icon({ name }: { name: string }) {
  return <svg className="ic"><use href={`#i-${name}`} /></svg>;
}

export function taskStatus(task: TaskSummary): 'ready' | 'progress' | 'done' {
  if (task.submitted?.sponsors && task.submitted?.context) return 'done';
  return task.sponsors.length || task.events.length || task.cameras.length || task.submitted?.sponsors || task.submitted?.context ? 'progress' : 'ready';
}

function Status({ task }: { task: TaskSummary }) {
  const status = taskStatus(task);
  return <span className={`status ${status}`}>{status === 'done' ? 'Completed' : status === 'progress' ? 'In progress' : 'Ready to tag'}</span>;
}

function Crest({ name, badges }: { name: string; badges: Record<string, string> }) {
  const initials = (name || '?').split(' ').map(part => part[0]).join('').slice(0, 3).toUpperCase();
  return (
    <span className="club-crest">
      <span className="crest-fallback">{initials}</span>
      {badges[name] && <img
        src={badges[name]}
        alt={`${name} crest`}
        loading="lazy"
        onLoad={event => {
          const sibling = event.currentTarget.previousElementSibling as HTMLElement | null;
          if (sibling) sibling.style.display = 'none';
        }}
        onError={event => event.currentTarget.remove()}
      />}
    </span>
  );
}

function FixtureName({ task, fixtures, badges }: { task: TaskSummary; fixtures: Fixture[]; badges: Record<string, string> }) {
  const fixture = fixtures.find(item => item.id === task.fixtureId || item.id === task.number || `MC-${item.id}` === task.number);
  const parts = task.name.split(/\s+vs\s+/i);
  const home = task.homeTeam || fixture?.home || parts[0];
  const away = task.awayTeam || fixture?.away || parts[1];
  if (!home || !away) return <span>{task.name}</span>;
  return <div className="fixture-mini"><Crest name={home} badges={badges} /><span>{home}</span><span className="vstag">VS</span><Crest name={away} badges={badges} /><span>{away}</span></div>;
}

function nameUser(data: StudioData, id: string): string {
  return data.users.find(user => user.id === id)?.name || 'Unassigned';
}

function VisibleTasks({ context }: { context: ScreenContext }): TaskSummary[] {
  const { data, user, viewerId } = context;
  if (!data) return [];
  return user?.role === 'admin' ? data.tasks : data.tasks.filter(task => task.sponsorAnalystId === viewerId || task.contextAnalystId === viewerId);
}

function TaskTable({ tasks, data, fixtures, badges }: { tasks: TaskSummary[]; data: StudioData; fixtures: Fixture[]; badges: Record<string, string> }) {
  if (!tasks.length) return <div className="empty"><strong>No tasks available</strong><p>Ask your administrator to assign a match.</p></div>;
  return (
    <div className="tablewrap">
      <table className="table">
        <thead><tr><th>Match</th><th>Assigned sponsor analyst</th><th>Events / camera analyst</th><th>Annotations</th><th>Status</th><th /></tr></thead>
        <tbody>
          {tasks.map(task => (
            <tr className="clickable" key={task.id} onClick={() => window.openTask?.(task.id)}>
              <td>
                <div className="mainname"><FixtureName task={task} fixtures={fixtures} badges={badges} /></div>
                <div className="detail">{task.number} · {task.date || 'No date'}</div>
              </td>
              <td>{nameUser(data, task.sponsorAnalystId)}</td>
              <td>{nameUser(data, task.contextAnalystId)}</td>
              <td>{task.sponsors.length + task.events.length + task.cameras.length} logs</td>
              <td><Status task={task} /></td>
              <td><Icon name="chevron" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchTiles({ tasks, data, fixtures, badges }: { tasks: TaskSummary[]; data: StudioData; fixtures: Fixture[]; badges: Record<string, string> }) {
  if (!tasks.length) return <div className="empty"><strong>No tasks available</strong><p>Ask your administrator to assign a match or create a new task.</p></div>;
  return <div className="match-tile-grid">{tasks.map(task => (
    <button type="button" className="match-tile" key={task.id} onClick={() => window.openTask?.(task.id)} aria-label={`Open ${task.name}`}>
      <div className="match-tile-head"><span className="match-tile-code">{task.number} · {task.date || 'DATE TBD'}</span><Status task={task} /></div>
      <div className="match-tile-match"><FixtureName task={task} fixtures={fixtures} badges={badges} /></div>
      <div className="match-tile-foot">
        <div className="match-tile-person">SPONSORS: {nameUser(data, task.sponsorAnalystId)}<div>EVENTS: {nameUser(data, task.contextAnalystId)}</div></div>
        <span className="match-tile-arrow"><Icon name="arrow" /></span>
      </div>
    </button>
  ))}</div>;
}

function TaskForFixture(tasks: TaskSummary[], fixtureId: string): TaskSummary | undefined {
  const normalized = fixtureId.trim().toUpperCase();
  const matching = tasks.filter(task => [task.fixtureId, task.number, task.number?.replace(/^MC-/, '')].some(value => value?.trim().toUpperCase() === normalized));
  return matching.find(task => taskStatus(task) === 'done') || matching.find(task => taskStatus(task) === 'progress') || matching[0];
}

function FixtureCatalog({ context }: { context: ScreenContext }) {
  const fixtures = context.fixtures || [];
  const data = context.data;
  const badges = context.badges || {};
  if (!data) return null;
  const days = [...new Set(fixtures.map(fixture => fixture.date))].sort();
  const visible = fixtures.filter(fixture => context.fixtureDay === 'all' || fixture.date === context.fixtureDay)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || (a.order || 0) - (b.order || 0));

  return (
    <section className="fixture-catalog">
      <div className="sectionhead">
        <div>
          <div className="eyebrow">SCHEDULE / LIVE DATA SNAPSHOT</div>
          <h2>MATCH CATALOG</h2>
          <p className="sub">Published fixture schedule with live annotation-task status. Completed matches are ready to review; existing tasks open directly without creating duplicates. Times shown in Eastern Time (ET).</p>
        </div>
        <span className="tag">{context.fixtureSyncLabel} · {fixtures.length} matches</span>
      </div>
      <div className="fixture-days">
        <button className={`chip ${context.fixtureDay === 'all' ? 'active' : ''}`} onClick={() => window.chooseFixtureDay?.('all')}>ALL DAYS</button>
        {days.map(day => <button key={day} className={`chip ${context.fixtureDay === day ? 'active' : ''}`} onClick={() => window.chooseFixtureDay?.(day)}>{day}</button>)}
      </div>
      <div className="fixture-cards">
        {visible.length ? visible.map(fixture => {
          const task = TaskForFixture(data.tasks, fixture.id);
          const status = task ? taskStatus(task) : 'uncreated';
          const title = status === 'done' ? 'Review completed annotation work' : task ? 'Open existing annotation task' : 'Create an annotation task';
          const action = status === 'done' ? '✓ COMPLETED' : task ? 'OPEN TASK →' : 'CREATE TASK +';
          const state = status === 'done' ? 'COMPLETED' : status === 'progress' ? 'IN PROGRESS' : status === 'ready' ? 'READY TO TAG' : 'NOT CREATED';
          const splitStreams = task && task.submitted?.sponsors !== task.submitted?.context;
          return <article className={`fixture-card fixture-task-${status}`} data-fixture-id={fixture.id} key={fixture.id}>
            <div className="fixture-date">{fixture.id} · {fixture.date} · {fixture.time || 'Time TBD'} ET <span>{fixture.stage || fixture.group || ''}</span></div>
            <div className={`fixture-task-state ${status}`}>{state}</div>
            <div className="fixture-line"><Crest name={fixture.home} badges={badges} /><b>{fixture.home}</b><strong>{fixture.score || 'VS'}</strong><b>{fixture.away}</b><Crest name={fixture.away} badges={badges} /></div>
            {splitStreams && <div className="fixture-stream-note">{task.submitted?.sponsors ? 'Sponsor tagging complete · Events & camera pending' : 'Events & camera complete · Sponsor tagging pending'}</div>}
            <div className="fixture-bottom">
              <span>{fixture.venue || 'Venue TBD'} · {fixture.status || 'Scheduled'}</span>
              <button className={`button tiny fixture-task-action ${status === 'done' ? 'fixture-completed' : 'ghost'}`} title={title} aria-label={`${title} for ${fixture.id}`} onClick={() => window.openFixtureTask?.(fixture.id)}>{action}</button>
            </div>
          </article>;
        }) : <p className="muted">No published matches on this date.</p>}
      </div>
    </section>
  );
}

export function DashboardScreen({ context }: { context: ScreenContext }) {
  const data = context.data;
  if (!data) return null;
  const fixtures = context.fixtures || [];
  const badges = context.badges || {};
  const tasks = VisibleTasks({ context });
  const done = tasks.filter(task => taskStatus(task) === 'done').length;
  const progress = tasks.filter(task => taskStatus(task) === 'progress').length;
  const annotations = tasks.reduce((sum, task) => sum + task.sponsors.length + task.events.length + task.cameras.length, 0);
  const stats = [['video', tasks.length, 'Assigned matches'], ['clock', progress, 'In progress'], ['check', done, 'Completed matches'], ['tags', annotations, 'Recorded annotations']] as const;

  return <>
    <div className="dashboard-banner">
      <div className="dashboard-banner-copy"><span className="banner-kicker">OFFICIAL MESSI CUP 2026 / MATCH OPERATIONS</span><strong>Every second of visibility matters.</strong><p>{fixtures.length} published fixtures · Build your analysis queue from the match catalog.</p></div>
      <button className="dashboard-banner-action" onClick={() => window.navigate?.('tasks')}>OPEN MATCH CATALOG <Icon name="arrow" /></button>
    </div>
    <div className="pagehead">
      <div><div className="eyebrow">TOURNAMENT / ANALYST WORKSPACE</div><h1>Workspace<span style={{ color: 'var(--orange)' }}>.</span></h1><p className="sub">Track broadcast visibility, match moments, and sponsor intelligence.</p></div>
      {context.user?.role === 'admin' && <button className="button primary" onClick={() => window.createTaskModal?.()}><Icon name="plus" /> Create a match</button>}
    </div>
    <div className="stats">
      {stats.map(([icon, count, label]) => <div className="card statcard" key={label}><div className="statghost" /><div className="staticon"><Icon name={icon} /></div><div className="svalue">{count}</div><div className="slabel">{label}</div></div>)}
    </div>
    <div className="layout2">
      <div className="card cardpad">
        <div className="sectionhead"><div><h2>Recent match assignments</h2><p className="sub">Select a match to start tagging or review its progress</p></div><button className="textlink" onClick={() => window.navigate?.('tasks')}>View all <Icon name="arrow" /></button></div>
        {tasks.length ? tasks.slice().reverse().slice(0, 5).map((task, index) => <div className="taskrow" key={task.id} onClick={() => window.openTask?.(task.id)}>
          <div className={`taskbadge ${index % 2 ? 'blue' : ''}`} title={`Match ${task.number}`}>{task.number}</div>
          <div className="info"><strong><FixtureName task={task} fixtures={fixtures} badges={badges} /></strong><span>{task.number} · {formatTimestamp(task.duration)} footage · {task.sponsorGroupIds.length} sponsor lists</span></div>
          <Status task={task} /><Icon name="chevron" />
        </div>) : <div className="empty"><strong>No assigned matches yet</strong><p>Matches appear after an administrator assigns them to you.</p></div>}
      </div>
      <div>
        <div className="callout"><div className="eyebrow" style={{ color: '#74d9fc' }}>INSIGHT ENGINE</div><h3>Tag once. Understand every moment.</h3><p>Every visibility interval can be combined with goals, replays and camera context.</p><button className="button" onClick={() => window.navigate?.('reports')}>Explore insights <Icon name="arrow" /></button></div>
        <div className="smalltiles"><div className="smalltile"><b>{data.sponsorGroups.reduce((sum, group) => sum + group.sponsors.length, 0)}</b><span>Brands in library</span></div><div className="smalltile"><b>{data.eventGroups.reduce((sum, group) => sum + group.items.length, 0)}</b><span>Event tag types</span></div></div>
      </div>
    </div>
    <div className="card cardpad"><div className="sectionhead"><h2>Production queue</h2><span className="tag">{tasks.length} matches</span></div><TaskTable tasks={tasks} data={data} fixtures={fixtures} badges={badges} /></div>
  </>;
}

export function MatchesScreen({ context }: { context: ScreenContext }) {
  if (!context.data) return null;
  const tasks = VisibleTasks({ context }).filter(task => context.taskFilter === 'all' || taskStatus(task) === context.taskFilter);
  const filters = [['all', 'All matches'], ['ready', 'Ready'], ['progress', 'In progress'], ['done', 'Completed']] as const;
  return <>
    <div className="pagehead">
      <div><div className="eyebrow">PRODUCTION / ALL MATCHES</div><h1>Match assignments</h1><p className="sub">Only matches assigned to your account are visible to you.</p></div>
      {context.user?.role === 'admin' && <button className="button primary" onClick={() => window.createTaskModal?.()}><Icon name="plus" /> New task</button>}
    </div>
    <div className="filterbar">
      {filters.map(([key, label]) => <button key={key} className={`chip ${context.taskFilter === key ? 'active' : ''}`} onClick={() => window.setFilter?.(key)}>{label}</button>)}
    </div>
    <MatchTiles tasks={tasks} data={context.data} fixtures={context.fixtures || []} badges={context.badges || {}} />
    {context.user?.role === 'admin' && <FixtureCatalog context={context} />}
  </>;
}

declare global {
  interface Window {
    openTask?: (id: string) => void;
    openFixtureTask?: (id: string) => void;
    chooseFixtureDay?: (day: string) => void;
    createTaskModal?: (id?: string) => void;
    setFilter?: (filter: string) => void;
  }
}
