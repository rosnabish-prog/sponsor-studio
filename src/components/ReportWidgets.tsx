import { useState } from 'react';
import type { ReportsScreenModel } from '../types/screen';
import type { TaskSummary } from '../types/models';
import { computeInsights, type InsightData, type InsightSources } from '../domain/analytics';
import { computeContextIntelligence } from '../domain/contextIntelligence';
import { formatTimestamp as fmt } from '../domain/intervals';
import { BrandLogo } from './StudioWidgets';
import { ExposureTrend, exposureWindows, type TimeWindow } from './ExposureTrend';
import { ExposureContextMap, CameraBrandHeatmap, MomentBrandHeatmap, CameraVisibilityBars } from './ContextVisuals';

const percent = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;
function Section({ title, note, aside, children, className = '' }: { title: string; note: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`insight-block ${className}`}><div className="insight-section-title"><div><h3>{title}</h3><p>{note}</p></div>{aside}</div>{children}</section>;
}
function Note({ children }: { children: React.ReactNode }) { return <p className="insight-muted">{children}</p>; }

function MatchHero({ task, model }: { task: TaskSummary; model: ReportsScreenModel }) {
  const fixture = model.fixtures.find(f => f.id === task.fixtureId || f.id === task.number || `MC-${f.id}` === task.number);
  if (!fixture) return null;
  function Team({ name }: { name: string }) {
    return <div className="match-club"><span className="club-crest"><span className="crest-fallback">{name.split(' ').map(n => n[0]).join('').slice(0, 3).toUpperCase()}</span>
      {model.badges[name] && <img src={model.badges[name]} alt={`${name} crest`} loading="lazy" onLoad={event => { const prev = event.currentTarget.previousElementSibling as HTMLElement | null; if (prev) prev.style.display = 'none'; }} onError={event => event.currentTarget.remove()} />}</span><h2>{name}</h2></div>;
  }
  return <section className="match-hero" aria-label="Match details"><div className="match-hero-meta">{fixture.group} · {fixture.id}</div>
    <div className="match-hero-body"><Team name={fixture.home} /><div className="match-result"><span>2026 MESSI CUP</span><strong>{fixture.score || 'VS'}</strong><span>{fixture.date}</span></div><Team name={fixture.away} /></div>
    <div className="match-venue">{fixture.venue} <span>·</span> Match details are a public fixture snapshot, not live results</div></section>;
}

function Breakdown({ rows, total, quality = false }: { rows: { key: string; label: string; seconds: number; intervals: number }[]; total: number; quality?: boolean }) {
  return <>{rows.map(row => <div className="intel-breakdown-row" key={row.key}>
    <div className="intel-breakdown-label"><span>{row.label}</span><strong>{fmt(row.seconds)}{quality ? '' : ` · ${row.intervals} APPEARANCES`}</strong></div>
    <div className={`intel-breakdown-meter ${quality ? `quality-${row.key}` : ''}`}><i style={{ width: `${Math.min(100, total ? 100 * row.seconds / total : 0)}%` }} /></div>
    <p>{percent(total ? 100 * row.seconds / total : 0)} of all recorded sponsor interval-seconds</p>
  </div>)}</>;
}

export function ExposureReport({ task, source, focusId, viewer = false }: { task: TaskSummary; source: InsightSources; focusId: string; viewer?: boolean }) {
  const [windowSeconds, setWindowSeconds] = useState<TimeWindow>(300);
  const d = computeInsights(task, source);
  const context = computeContextIntelligence(task, source, d);
  const focus = d.active.find(brand => brand.id === focusId);
  const incomplete = !(task.submitted?.sponsors && task.submitted?.context);
  const peak = Math.max(1, ...d.active.map(brand => brand.seconds));
  const peakWindows = d.buckets.map(bucket => {
    const visible = focus ? focus.own.reduce((total, interval) => total + Math.max(0, Math.min(interval.end, bucket.end) - Math.max(interval.start, bucket.start)), 0) : bucket.covered;
    return { ...bucket, visible, visiblePct: d.pct(visible, bucket.end - bucket.start) };
  }).filter(bucket => bucket.visible > 0).sort((a, b) => b.visiblePct - a.visiblePct || b.visible - a.visible).slice(0, 5);
  const cards = [
    { label: 'TOTAL SPONSOR VISIBILITY', value: fmt(d.sumSeconds), note: 'Combined unique-brand seconds; multiple brands add separately' },
    { label: 'EXPOSURE FREQUENCY', value: String(d.frequency), note: 'Distinct positive-duration sponsor appearances' },
    { label: 'AVERAGE EXPOSURE DURATION', value: d.frequency ? fmt(d.avgExposure) : '—', note: 'Total visible brand seconds ÷ recorded appearances' },
    { label: 'SPONSOR VISIBLE FOOTAGE', value: percent(d.pct(d.coveredSeconds, d.videoSeconds)), note: `${fmt(d.coveredSeconds)} of ${fmt(d.videoSeconds)} footage with at least one sponsor` },
    { label: 'BRANDS WITH EXPOSURE', value: String(d.active.length), note: `${d.brands.length} configured in the match · only measured visibility counts` },
    { label: 'HIGH-VALUE EVENT EXPOSURE', value: d.highValueEvents.length ? fmt(d.highValueCoverageSeconds) : '—', note: `${d.highValueEvents.length} high-value event intervals classified` },
  ];
  const warnings = [
    d.sponsorOpen && `${d.sponsorOpen} sponsor visibility tag(s) still open`,
    d.eventOpen && `${d.eventOpen} key-event interval(s) still open`,
    d.cameraOpen && `${d.cameraOpen} camera interval(s) still open`,
    d.cameraCovered === 0 && 'No camera-angle coverage recorded',
    context.cameraCoverage < 99 && `Camera-angle coverage is ${percent(context.cameraCoverage)}; comparisons by view use only tagged camera footage`,
    !context.closeup.seconds && 'No camera interval labelled close-up or zoomed; zoom-view exposure cannot be calculated',
    !d.periodMapped && 'Match half boundaries not mapped',
    d.placementUnclassified > 0 && 'Some sponsor exposures have no placement type',
    d.qualityUnclassified > 0 && 'Some sponsor exposures have no visibility quality',
    !d.active.length && 'No sponsor intervals have measurable duration',
  ].filter((message): message is string => typeof message === 'string');
  return <div className="insights-dashboard">
    <div className="insight-head"><div><div className="eyebrow">MATCH BROADCAST INTELLIGENCE</div><h2>SPONSOR EXPOSURE REPORT</h2><p className="sub">Calculated from sponsor visibility, event intervals and broadcast camera tags.</p></div>
      <span className={`insight-quality ${incomplete ? 'draft' : 'complete'}`}>{incomplete ? 'PRELIMINARY · ANNOTATION IN PROGRESS' : 'SUBMITTED DATA'}</span>
    </div>
    <div className="insight-stat-grid">{cards.map(card => <article className="insight-stat" key={card.label}><span>{card.label}</span><strong>{card.value}</strong><p>{card.note}</p></article>)}</div>
    <Section title="BROADCAST CONTEXT SNAPSHOT" note="Adds camera-view context and concurrent visibility to the core exposure measurements. Camera types come from analyst labels.">
      <div className="intel-context-kpis">
        <article><span>CLOSE-UP VIEW · SPONSOR VISIBLE</span><strong>{context.closeup.seconds ? fmt(context.closeup.visibleSeconds) : '—'}</strong><small>{context.closeup.seconds ? `${percent(context.closeup.rate)} of ${fmt(context.closeup.seconds)} close-up footage` : 'No close-up/zoomed camera label recorded'}</small></article>
        <article><span>REPLAY VIEW · SPONSOR VISIBLE</span><strong>{context.replay.seconds ? fmt(context.replay.visibleSeconds) : '—'}</strong><small>{context.replay.seconds ? `${percent(context.replay.rate)} of ${fmt(context.replay.seconds)} replay footage` : 'No replay camera interval recorded'}</small></article>
        <article><span>2+ BRANDS VISIBLE TOGETHER</span><strong>{fmt(context.multiBrandSeconds)}</strong><small>Maximum {context.maximumConcurrent} distinct brands at once</small></article>
        <article><span>CAMERA ANGLE SWITCHES</span><strong>{context.cuts}</strong><small>{context.cameraTaggedSeconds ? `${context.cutsPerMinute.toFixed(1)} switches per annotated camera minute` : 'Camera annotation required'}</small></article>
      </div>
    </Section>
    <Section title="WHERE SPONSORS APPEAR IN THE MATCH" note={focus ? `${focus.name} was visible for ${fmt(focus.seconds)} (${percent(d.pct(focus.seconds,d.videoSeconds))} of the broadcast).` : d.active.length ? `${fmt(d.coveredSeconds)} of ${fmt(d.videoSeconds)} has recorded sponsor visibility across ${d.active.length} brands.` : 'No sponsor exposure has been recorded in this match.'} className="insight-trend"
      aside={<div className="insight-trend-filters">
        <label className="insight-select" htmlFor="exposureInterval">TIME INTERVAL<select id="exposureInterval" value={windowSeconds} onChange={event => setWindowSeconds(Number(event.target.value) as TimeWindow)}>
          {exposureWindows.map(item => <option key={item.seconds} value={item.seconds}>{item.label}</option>)}
        </select></label>
        <label className="insight-select" htmlFor="insightSponsorFilter">BRAND FILTER<select id="insightSponsorFilter" value={focusId} onChange={event => window.selectInsightSponsor?.(event.target.value)}>
          <option value="">ALL SPONSORS</option>{d.active.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
      </div>}>
      <ExposureTrend data={d} focusId={focusId} windowSeconds={windowSeconds} />
      <div className="insight-trend-footer"><span>FIRST FRAME 00:00</span><span>{focus?.name.toUpperCase() || 'ANY SPONSOR VISIBLE'}</span><span>FINAL FRAME {fmt(d.videoSeconds)}</span></div>
      <div className="intel-peak-windows"><strong>TOP 5-MINUTE VISIBILITY WINDOWS · {focus?.name.toUpperCase() || 'ANY SPONSOR'}</strong><div>{peakWindows.map(bucket=><div key={bucket.start} className="intel-peak-window">
        {viewer ? <span>{fmt(bucket.start)}–{fmt(bucket.end)}</span> : <button type="button" onClick={()=>window.goToAnnotatedTime?.(task.id,bucket.start)} title="Open studio at the start of this exposure window">{fmt(bucket.start)}–{fmt(bucket.end)}</button>}
        <b>{percent(bucket.visiblePct)}</b><small>{fmt(bucket.visible)} {focus ? 'brand' : 'sponsor'}-visible · {bucket.eventCount} events</small>
      </div>)}{!peakWindows.length&&<span className="insight-muted">No measured visibility windows yet.</span>}</div></div>
    </Section>
    <Section title="EXPOSURE CONTEXT MAP" note={`A shared video-time map of sponsor presence, key moments, zoomed camera views, replays and camera coverage.${viewer ? '' : ' Select a segment to open the footage.'}`}>
      <ExposureContextMap data={d} context={context} focusId={focusId} taskId={task.id} viewer={viewer} />
    </Section>
    <Section title="BRAND EXPOSURE LEADERBOARD" note="Only brands with measurable positive-duration exposure. Share of voice is brand seconds divided by combined brand seconds." aside={<span className="insight-count">{d.active.length} BRANDS RECORDED</span>}>
      <div className="tablewrap"><table className="table insight-table"><thead><tr><th>BRAND</th><th>VISIBLE TIME</th><th>% OF MATCH</th><th>VISIBILITY SHARE</th><th>APPEARANCES</th><th>AVG DURATION</th><th>LONGEST</th><th>EVENTS</th></tr></thead>
        <tbody>{d.active.map((brand, index) => <tr key={brand.id}>
          <td><div className="insight-brand-cell"><span>{index + 1}</span><BrandLogo sponsor={brand} /><b>{brand.name}</b></div></td>
          <td><strong>{fmt(brand.seconds)}</strong><div className="insight-mini-meter"><i style={{ width: `${100 * brand.seconds / peak}%` }} /></div></td>
          <td>{percent(d.pct(brand.seconds, d.videoSeconds))}</td><td>{percent(d.pct(brand.seconds, d.sumSeconds))}</td><td>{brand.own.length}</td>
          <td>{brand.own.length ? fmt(brand.seconds / brand.own.length) : '—'}</td><td>{fmt(brand.longest)}</td><td>{brand.eventHits}</td>
        </tr>)}{!d.active.length && <tr><td colSpan={8}>No measured sponsor exposure yet. Configured brands will appear here after they have positive-duration annotations.</td></tr>}</tbody></table></div>
    </Section>
    <div className="insight-columns">
      <Section title="SPONSORSHIP PLACEMENT TYPE" note="Which physical or broadcast placements contributed more visibility seconds?" aside={<span className="insight-count">CLASSIFIED {percent(d.placementCoverage)}</span>}>
        <Breakdown rows={d.placementTotals} total={d.classifiedSeconds} />
        {!d.placementTotals.length && <Note>Choose each interval’s primary placement in Recorded Actions to unlock this breakdown.</Note>}
        <div className="intel-unknown">UNCLASSIFIED PLACEMENT: {fmt(d.placementUnclassified)} · No placement inferred from the brand logo.</div>
      </Section>
      <Section title="VISIBILITY QUALITY" note="Readable, partially readable or obscured sponsor appearances." aside={<span className="insight-count">CLASSIFIED {percent(d.qualityCoverage)}</span>}>
        <Breakdown rows={d.qualityTotals} total={d.classifiedSeconds} quality />
        {!d.qualityTotals.length && <Note>Select Clear / Partial / Obscured for each sponsor interval to unlock this breakdown.</Note>}
        <div className="intel-unknown">UNCLASSIFIED QUALITY: {fmt(d.qualityUnclassified)} · Values apply to each appearance, not individual frames.</div>
      </Section>
    </div>
    <Section title="EXPOSURE BY MATCH PERIOD" note="First-half versus second-half broadcast visibility, using video time rather than assuming the match clock."
      aside={<span className="insight-count">{d.periodMapped ? 'MATCH PERIODS MAPPED' : 'PERIOD MAPPING REQUIRED'}</span>}>
      {d.periodMapped ? <div className="intel-period-grid">{d.periodBreakdown.filter(window => window.key !== 'break').map(window => <article className="intel-period-card" key={window.key}>
        <div className="intel-period-header"><b>{window.label}</b><span>{fmt(window.start)} – {fmt(window.end)}</span></div>
        <strong>{fmt(window.combinedBrandSeconds)}<small> COMBINED SPONSOR EXPOSURE</small></strong>
        <p>{fmt(window.anySeconds)} of {fmt(window.end - window.start)} video with at least one sponsor tag</p>
        <div className="intel-breakdown-meter"><i style={{ width: `${d.pct(window.anySeconds, window.end - window.start)}%` }} /></div>
        <div className="intel-period-leaders">{window.brandRows.slice(0, 5).map(brand => <div key={brand.id}><span>{brand.name}</span><b>{fmt(brand.seconds)}</b></div>)}
          {!window.brandRows.length && <span className="insight-muted">No sponsor tags recorded in this period.</span>}</div>
      </article>)}</div> : <div className="intel-unmapped"><b>MATCH PERIODS ARE NOT MAPPED</b><p>An admin can open the match Actions menu → Edit Task and enter First-half end and Second-half start video minutes. We do not infer the halftime boundary from footage duration.</p></div>}
    </Section>
    <Section title="HIGH-VALUE MOMENT EXPOSURE" note="Which sponsors were visible during tagged goals, celebrations, penalties and other selected major moments?" aside={<span className="insight-count">{d.highValueEvents.length} HIGHLIGHTED MOMENTS</span>}>
      <div className="intel-moment-summary"><div><span>UNIQUE MOMENT TIME</span><strong>{fmt(d.highValueMomentSeconds)}</strong></div>
        <div><span>MOMENT TIME WITH ANY SPONSOR</span><strong>{fmt(d.highValueCoverageSeconds)}</strong></div>
        <div><span>MOMENT COVERAGE</span><strong>{d.highValueMomentSeconds ? percent(d.pct(d.highValueCoverageSeconds, d.highValueMomentSeconds)) : '—'}</strong></div></div>
      <div className="intel-moment-list">{d.brandHighValue.slice(0, 8).map(brand => <div className="intel-breakdown-row" key={brand.id}>
        <div className="intel-breakdown-label"><span>{brand.name}</span><strong>{fmt(brand.seconds)} · {brand.momentCount} MOMENTS</strong></div>
        <div className="intel-breakdown-meter"><i style={{ width: `${Math.min(100, d.pct(brand.seconds, d.highValueMomentSeconds))}%` }} /></div>
      </div>)}{!d.brandHighValue.length && <Note>No sponsor overlap during the currently identified high-value event intervals.</Note>}</div>
      <p className="intel-unknown">Highlights use goal, celebration, penalty, trophy or award event names unless a custom event is explicitly marked high value. This is exposure context, not a sponsorship valuation.</p>
    </Section>
    <Section title="KEY MOMENTS · BEFORE, DURING & AFTER" note="Ten seconds before and after each highlighted interval, plus its exact tagged duration. Independent phase windows may overlap when events occur close together." aside={<span className="insight-count">{context.momentRows.length} MOMENTS</span>}>
      <div className="intel-moment-phases">{context.momentPhases.map(phase => <article key={phase.key}>
        <div className="intel-phase-title"><span>{phase.label}</span><b>{phase.seconds ? percent(phase.coverage) : '—'}</b></div>
        <strong>{phase.seconds ? fmt(phase.visibleSeconds) : '—'}</strong><small>BRAND-VISIBLE TIME / {fmt(phase.seconds)} MEASURED</small>
        <div className="intel-breakdown-meter"><i style={{width:`${Math.min(100,phase.coverage)}%`}} /></div>
        <p>{phase.brands.length ? phase.brands.slice(0,3).map(brand=>`${brand.name} ${fmt(brand.seconds)}`).join(' · ') : 'No measured brand overlap'}</p>
      </article>)}</div>
      <h4 className="intel-context-subtitle">BRAND EXPOSURE HEATMAP · BY MOMENT PHASE</h4>
      <MomentBrandHeatmap context={context} />
      <div className="intel-context-list">{context.momentRows.slice(0,30).map(event=><div className="intel-moment-detail" key={event.id}>
        <div><b>{event.name}</b><span>{fmt(event.start)}–{fmt(event.end)} · {event.open?'OPEN':'SAVED'}</span></div>
        <p>{event.brands.length ? event.brands.map(brand=>`${brand.name} (${fmt(brand.seconds)})`).join(' · ') : 'No overlapping sponsor tags'}</p>
        <small>{event.cameraNames.length ? `Camera: ${event.cameraNames.join(', ')}` : 'Camera context not recorded'} · Close-up brand-visible: {fmt(event.closeupSponsorSeconds)}</small>
        {!viewer && <button className="insight-jump" onClick={()=>window.goToAnnotatedTime?.(task.id,event.start)}>OPEN AT TIME</button>}
      </div>)}{!context.momentRows.length&&<Note>No high-value event intervals recorded. Mark relevant event types as high value in the attribute catalog.</Note>}</div>
    </Section>
    <div className="insight-columns">
      <Section title="KEY EVENT SPONSOR ASSOCIATIONS" note="Exactly which brands overlapped each recorded match action." aside={<span className="insight-count">{d.eventRows.length} EVENTS</span>}>
        <div className="insight-event-summaries">{d.eventGroups.map(group => <div className="insight-event-summary" key={group.name}><strong>{group.name}</strong><span>{group.withBrands} / {group.count} WITH SPONSORS</span><b>{fmt(group.seconds)}</b></div>)}
          {!d.eventGroups.length && <Note>No key events have been tagged.</Note>}</div>
        <div className="insight-events-list">{d.eventRows.slice(0, 80).map(event => <div className="insight-event-card" key={event.id}>
          <div className="insight-event-heading"><div><b>{event.name}</b><span>{fmt(event.start)} – {event.legacyPoint ? 'LEGACY POINT' : event.open ? 'OPEN' : fmt(event.end)}</span></div>
            {!viewer && <button className="insight-jump" onClick={() => window.goToAnnotatedTime?.(task.id, event.start)}>OPEN AT TIME</button>}</div>
          <div className="insight-event-metrics"><strong>{event.brands.length} BRANDS OVERLAPPED</strong><span>{event.legacyPoint ? 'MOMENT TAG' : `${percent(event.coveragePct)} OF EVENT HAS A BRAND VISIBLE`}</span></div>
          <p>{event.brands.length ? event.brands.map(brand => brand.name).join(' · ') : 'No sponsor visibility overlaps this event'}</p>
        </div>)}{!d.eventRows.length && <Note>Tag events with start and end timestamps to reveal sponsor exposure during important moments.</Note>}</div>
      </Section>
      <Section title="SIMULTANEOUS BRAND VISIBILITY" note="Distinct brands sharing a frame. Each sponsor counts once, even when multiple copies of a logo appear.">
        <div className="intel-parallel-distribution">{context.parallelSeconds.map((seconds,index)=><div key={index}>
          <span>{['NO BRAND TAG','1 BRAND','2 BRANDS','3+ BRANDS'][index]}</span><b>{fmt(seconds)}</b>
          <div className="intel-breakdown-meter"><i style={{width:`${Math.min(100,d.pct(seconds,d.videoSeconds))}%`}} /></div>
        </div>)}</div>
        {d.pairs.slice(0, 8).map(pair => <div className="insight-pair" key={`${pair.a}:${pair.b}`}><span>{pair.a} <em>+</em> {pair.b}</span><b>{fmt(pair.seconds)}</b></div>)}
        {!d.pairs.length && <Note>No overlapping sponsor pairs recorded yet.</Note>}
        <div className="insight-coverage-note"><b>NO SPONSOR TAG RECORDED</b><strong>{fmt(Math.max(0, d.videoSeconds - d.coveredSeconds))}</strong><span>Footage without recorded sponsor visibility. This does not prove no sponsor appeared when annotation is incomplete.</span></div>
      </Section>
    </div>
    <Section title="CAMERA-ANGLE PERFORMANCE" note="Shot frequency, average shot length, and actual sponsor-visible footage within each tagged camera context." aside={<span className="insight-count">{percent(context.cameraCoverage)} CAMERA TAGGED</span>}>
      <CameraVisibilityBars context={context} />
      <div className="tablewrap"><table className="table insight-table"><thead><tr><th>CAMERA</th><th>TAGGED TIME</th><th>SHOTS</th><th>AVG SHOT</th><th>BRAND-VISIBLE TIME</th><th>VIEW COVERAGE</th><th>COMBINED BRAND TIME</th><th>TOP BRAND</th></tr></thead><tbody>
        {context.cameraRows.filter(camera=>camera.seconds>0).map(camera => <tr key={camera.id}><td><b>{camera.name}</b></td><td>{fmt(camera.seconds)}</td><td>{camera.shots}</td><td>{camera.shots?fmt(camera.seconds/camera.shots):'—'}</td>
          <td>{fmt(camera.sponsorVisibleSeconds)}</td><td>{percent(camera.visibilityRate)}</td><td>{fmt(camera.combinedBrandSeconds)}</td><td>{camera.brandRows[0]?.name||'—'}</td></tr>)}
        {!context.cameraRows.some(camera=>camera.seconds>0) && <tr><td colSpan={8}>No measurable camera intervals recorded yet.</td></tr>}
      </tbody></table></div>
      <p className="intel-unknown">View coverage = seconds with at least one tagged sponsor ÷ seconds in that camera angle. Combined brand time counts different brands separately. Camera labels describe the broadcast shot, not the size of any logo.</p>
    </Section>
    <Section title="BRAND × CAMERA VISIBILITY MATRIX" note="Exact overlap seconds for each brand and annotated camera angle. Percentage uses that camera angle's tagged duration as its denominator.">
      <CameraBrandHeatmap context={context} />
    </Section>
    <div className="insight-columns">
      <Section title="CLOSE-UP & REPLAY VISIBILITY" note="Where sponsors appear during close-up, zoomed and replay camera annotations. This does not imply the logo itself was zoomed.">
        {[context.closeup,context.replay].map(group=><div className="intel-view-card" key={group.name}>
          <div className="intel-view-title"><b>{group.name.toUpperCase()}</b><strong>{group.seconds?fmt(group.visibleSeconds):'—'}</strong></div>
          <p>{group.seconds ? `${percent(group.rate)} of tagged ${group.name.toLowerCase()} time has at least one sponsor` : 'No matching camera angle recorded'}</p>
          <div className="intel-breakdown-meter"><i style={{width:`${Math.min(100,group.rate)}%`}} /></div>
          <div className="intel-view-brands">{group.brands.slice(0,6).map(brand=><div key={brand.id}><span>{brand.name}</span><b>{fmt(brand.seconds)} · {percent(brand.shareOfBrand)} of its exposure</b></div>)}
            {!group.brands.length&&<Note>No measured sponsor overlap in this view.</Note>}</div>
          {group.cameraNames.length>0&&<small>CAMERA LABELS: {group.cameraNames.join(' · ')}</small>}
        </div>)}
      </Section>
      <Section title="CAMERA-CUT CONTINUITY" note="A brand is retained across a tagged cut if it appears within two seconds before and after the camera switch.">
        <div className="intel-cut-summary"><div><span>VALID CAMERA CUTS</span><strong>{context.cuts}</strong></div><div><span>BRAND RETAINED</span><strong>{context.cutRetentionOpportunities?percent(context.pct(context.cutRetained,context.cutRetentionOpportunities)):'—'}</strong></div></div>
        {context.cutRetention.slice(0,8).map(brand=><div key={brand.id} className="intel-cut-row"><span>{brand.name}</span><b>{brand.retained}/{brand.opportunities} cuts</b></div>)}
        {!context.cutRetention.length&&<Note>No sponsor-visible camera transitions measured. Consecutive camera intervals must meet within 0.75 seconds.</Note>}
        <p className="intel-unknown">Retention is a per-brand count, not an audience engagement metric. Missing camera coverage can make this incomplete.</p>
      </Section>
    </div>
    <Section title="BRAND CONTEXT & EXPOSURE QUALITY" note="Compare event-linked exposure, close-up/replay context, first appearance, exposure consistency, and explicitly flagged clarity issues." aside={<span className="insight-count">{context.brandContexts.length} EXPOSED BRANDS</span>}>
      <div className="tablewrap"><table className="table insight-table"><thead><tr><th>BRAND</th><th>FIRST SEEN</th><th>MEDIAN APPEARANCE</th><th>90TH PERCENTILE</th><th>SHORT ≤2 SEC</th><th>KEY MOMENTS</th><th>CLOSE-UP VIEW</th><th>REPLAY VIEW</th><th>FLAGGED CLARITY</th></tr></thead><tbody>
        {context.brandContexts.map(brand=><tr key={brand.id}><td><b>{brand.name}</b></td><td>{brand.first===null?'—':fmt(brand.first)}</td><td>{fmt(brand.median)}</td><td>{fmt(brand.p90)}</td><td>{brand.shortAppearances} / {brand.appearances}</td><td>{fmt(brand.momentSeconds)} · {brand.momentCount} events</td><td>{context.closeup.seconds?fmt(brand.closeupSeconds):'—'}</td><td>{context.replay.seconds?fmt(brand.replaySeconds):'—'}</td><td>{fmt(brand.flaggedClaritySeconds)}</td></tr>)}
        {!context.brandContexts.length&&<tr><td colSpan={9}>No measured sponsor intervals are available for a brand comparison yet.</td></tr>}
      </tbody></table></div>
      <p className="intel-unknown">Clarity flags are explicit non-default sponsor sub-attributes (for example “Unclear”). The implicit “Clearly visible” default is not a manually verified quality rating. Median and 90th percentile use merged appearance durations.</p>
    </Section>
    <section className="insight-notes"><div><h3>DATA QUALITY &amp; INTERPRETATION</h3>
      <p>Based only on manually tagged sponsor presence. All durations reference footage timestamps, not clock time or estimated audience exposure. Different brands visible simultaneously each contribute their own exposure seconds, so combined brand exposure may exceed video duration. A sponsor is counted once even when its logo is repeated in the frame.</p>
      <p>Unannotated footage is not proof that sponsors were absent. Close-up and replay statistics refer to the tagged camera context, not whether the sponsor logo was zoomed or readable. These annotations cannot establish logo size, screen coverage, ad prominence, audience impressions, monetary valuation, or whether an advertised brand was noticed by a viewer.</p></div>
      <div><h4>ANNOTATION CHECKS</h4><p>Latest annotated timestamp: {fmt(d.endpoint)} of {fmt(d.videoSeconds)}.</p>
        {warnings.length ? warnings.map(warning => <div className="insight-warning" key={warning}>{warning}</div>) : <div className="insight-ok">No open tags or missing camera coverage detected</div>}</div></section>
  </div>;
}

export function TournamentBenchmark({ tasks, model }: { tasks: TaskSummary[]; model: ReportsScreenModel }) {
  const eligible = tasks.filter(task => task.sponsors.length > 0 || task.submitted?.sponsors);
  if (eligible.length < 2) return null;
  const all = eligible.map(task => ({ task, data: computeInsights(task, resolveSources(task, model)) }));
  const totalFootage = all.reduce((sum, item) => sum + item.data.videoSeconds, 0);
  const studied = all.reduce((sum, item) => sum + item.data.coveredSeconds, 0);
  const summary = new Map<string, { name: string; seconds: number; matchesPresent: number; matchesConfigured: number; eventHits: number; longest: number }>();
  for (const { data } of all) for (const brand of data.brands) {
    const key = brand.name.trim().toLocaleLowerCase();
    const item = summary.get(key) || { name: brand.name, seconds: 0, matchesPresent: 0, matchesConfigured: 0, eventHits: 0, longest: 0 };
    item.matchesConfigured++;
    if (brand.seconds > 0) item.matchesPresent++;
    item.seconds += brand.seconds;
    item.eventHits += brand.eventHits;
    item.longest = Math.max(item.longest, brand.longest);
    summary.set(key, item);
  }
  const rows = [...summary.values()].filter(row => row.seconds > 0).sort((a, b) => b.seconds - a.seconds);
  const cards = [
    ['MATCHES IN SAMPLE', String(eligible.length), 'Unannotated matches are excluded'],
    ['FOOTAGE IN SAMPLE', fmt(totalFootage), 'Sum of video durations in the sample'],
    ['SPONSOR-VISIBLE FOOTAGE', fmt(studied), 'Sum of footage covered by any sponsor tag'],
    ['BRANDS IN SAMPLE', String(rows.filter(row => row.seconds > 0).length), 'Distinct normalized brand names'],
  ];
  return <details className="insight-rollup"><summary><div><span className="eyebrow">TOURNAMENT INTELLIGENCE / MULTI-MATCH COMPARISON</span><h2>COMPARE SPONSORS ACROSS MATCHES</h2>
    <p className="sub">{eligible.length} matches with sponsor annotation data · Click to expand tournament analysis.</p></div><span className="insight-expand-label">EXPAND REPORT ⌄</span></summary>
    <div className="insight-rollup-body"><div className="insight-stat-grid">{cards.map(([label, value, note]) => <article className="insight-stat" key={label}><span>{label}</span><strong>{value}</strong><p>{note}</p></article>)}</div>
      <div className="insight-section-title" style={{ marginTop: 18 }}><div><h3>TOURNAMENT BRAND BENCHMARK</h3><p>Aggregated tagged exposure across selected matches. The sample is not a claim about unprocessed fixtures.</p></div></div>
      <div className="tablewrap"><table className="table insight-table"><thead><tr><th>BRAND</th><th>TOTAL EXPOSURE</th><th>MATCHES VISIBLE</th><th>AVERAGE PER VISIBLE MATCH</th><th>EVENT OVERLAPS</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.name}><td><b>{row.name}</b></td><td>{fmt(row.seconds)}</td><td>{row.matchesPresent} / {row.matchesConfigured} configured</td>
          <td>{row.matchesPresent ? fmt(row.seconds / row.matchesPresent) : '—'}</td><td>{row.eventHits}</td></tr>)}</tbody></table></div>
      <p className="insight-rollup-note">This comparison uses annotations returned by the shared workspace API for accessible matches. It merges sponsor names case-insensitively and does not assume that similarly named brands are legally identical.</p>
    </div>
  </details>;
}

export function resolveSources(task: TaskSummary, model: ReportsScreenModel): InsightSources {
  return {
    sponsors: model.data.sponsorGroups.filter(group => task.sponsorGroupIds.includes(group.id)).flatMap(group => group.sponsors.map(sponsor => ({ ...sponsor, groupName: group.name }))).filter((sponsor, index, all) => all.findIndex(other => other.id === sponsor.id) === index),
    events: model.data.eventGroups.filter(group => task.eventGroupIds.includes(group.id)).flatMap(group => group.items),
    cameras: model.data.cameraGroups.filter(group => task.cameraGroupIds.includes(group.id)).flatMap(group => group.items),
  };
}

export function ReportsBody({ model, viewer = false }: { model: ReportsScreenModel; viewer?: boolean }) {
  const task = model.selectedTask;
  if (!task) return null;
  return <><MatchHero task={task} model={model} /><ExposureReport task={task} source={resolveSources(task, model)} focusId={model.focusId} viewer={viewer} />
    <TournamentBenchmark tasks={model.visibleTasks} model={model} /></>;
}

declare global {
  interface Window {
    selectInsightSponsor?: (id: string) => void;
    goToAnnotatedTime?: (id: string, time: number) => void;
  }
}
