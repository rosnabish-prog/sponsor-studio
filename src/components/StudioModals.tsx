import { useState, type FormEvent, type ReactNode } from 'react';
import type { Fixture, Sponsor, SponsorGroup, StudioData, TagGroup, TaskSummary, TeamMember } from '../types/models';

export type DialogModel =
  | { type: 'confirm'; title: string; message: string; actionLabel: string; danger: boolean }
  | { type: 'assign'; task: TaskSummary; users: TeamMember[] }
  | { type: 'task'; task?: TaskSummary; data: StudioData; fixtures: Fixture[]; localVideoName?: string }
  | { type: 'group'; kind: 'sponsor' | 'event' | 'camera'; group?: SponsorGroup | TagGroup }
  | { type: 'sponsor'; group: SponsorGroup; sponsor?: Sponsor }
  | { type: 'item'; kind: 'event' | 'camera'; groupId: string }
  | { type: 'user'; user?: TeamMember }
  | { type: 'credentials'; name: string; email: string; temporaryPassword: string | null; purpose: 'created' | 'reset' };

function Icon({ name }: { name: string }) { return <svg className="ic"><use href={`#i-${name}`} /></svg>; }
function Footer({ children }: { children: ReactNode }) { return <div className="modalfoot">{children}</div>; }
function Cancel() { return <button type="button" className="button ghost" onClick={() => window.closeModal?.()}>Cancel</button>; }
function Save({ children }: { children: ReactNode }) { return <button type="submit" className="button primary">{children}</button>; }
function Field({ title, children, full = false }: { title: string; children: ReactNode; full?: boolean }) {
  return <div className={`field ${full ? 'full' : ''}`}><label>{title}</label>{children}</div>;
}
function Options({ users, selected }: { users: TeamMember[]; selected?: string }) {
  return <><option value="">Unassigned</option>{users.filter(user => user.role === 'analyst').map(user => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</>;
}
function GroupChoices({ groups, selected, name }: { groups: (SponsorGroup | TagGroup)[]; selected: string[]; name: string }) {
  return <div className="checkgrid">{groups.length ? groups.map(group => <label className="checkline" key={group.id}>
    <input type="checkbox" name={name} value={group.id} defaultChecked={selected.includes(group.id)} /><span>{group.name}</span>
  </label>) : <span className="muted small">No attribute group exists. Add one in the library first.</span>}</div>;
}

function AssignModal({ task, users }: Extract<DialogModel, { type: 'assign' }>) {
  return <>
    <form id="studioModalForm" onSubmit={event => { event.preventDefault(); window.saveTaskAssignment?.(task.id); }}>
      <div className="modalbody">
        <div className="assignment-summary"><span className="eyebrow">MATCH {task.number}</span><strong>{task.name}</strong><p>Choose the analysts responsible for each tagging stream. You may assign both to the same person, or leave either stream unassigned.</p></div>
        <div className="assignment-fields">
          <div className="field"><label htmlFor="assignSponsorWorker">Sponsor visibility analyst</label><select id="assignSponsorWorker" defaultValue={task.sponsorAnalystId || ''}><Options users={users} /></select><small>Records sponsor appearances and visibility durations.</small></div>
          <div className="field"><label htmlFor="assignContextWorker">Events & camera analyst</label><select id="assignContextWorker" defaultValue={task.contextAnalystId || ''}><Options users={users} /></select><small>Records key match events and broadcast camera angles.</small></div>
        </div>
        {(task.submitted?.sponsors || task.submitted?.context) && <p className="assignment-notice">A completed tagging stream remains locked when reassigned. An admin must reopen it separately to permit changes.</p>}
      </div>
      <Footer><Cancel /><Save>Save assignment</Save></Footer>
    </form>
  </>;
}

function TaskModal({ task, data, fixtures, localVideoName }: Extract<DialogModel, { type: 'task' }>) {
  const [sourceType, setSourceType] = useState(task?.videoType || 'none');
  const [sourceUrl, setSourceUrl] = useState(task?.videoType === 's3' ? '' : task?.videoUrl || '');
  const [removeVideo, setRemoveVideo] = useState(false);
  const storedVideo = !!task?.videoAssetId;
  const removable = !storedVideo && !removeVideo && !!task && (!!localVideoName || sourceType !== 'none' || !!sourceUrl);
  return <form id="studioModalForm" onSubmit={event => { event.preventDefault(); window.saveTask?.(task?.id || ''); }}>
    <div className="modalbody"><div className="formgrid">
      {!task && <Field full title="IMPORT FROM OFFICIAL 2026 MATCH CATALOG"><select id="taskfixture" defaultValue="" onChange={event => window.selectFixture?.(event.target.value)}>
        <option value="">Custom match / select official fixture</option>{fixtures.map(fixture => <option key={fixture.id} value={fixture.id}>{fixture.id} · {fixture.home} vs {fixture.away} · {fixture.date}</option>)}
      </select><small>Daily BuildUp public match data; automatically refreshed when the feed is available.</small></Field>}
      <Field title="Task name *"><input id="taskname" required defaultValue={task?.name || ''} placeholder="Inter Miami CF vs Arsenal FC" /></Field>
      <Field title="Task number *"><input id="tasknumber" required defaultValue={task?.number || ''} placeholder="MC-004" /></Field>
      <Field title="Match date"><input id="taskdate" type="date" defaultValue={task?.date || ''} /></Field>
      <Field title="Expected footage length (minutes)"><input id="taskduration" type="number" min="1" step="0.01" defaultValue={Math.round((task?.duration || 3600) / 60 * 100) / 100} /></Field>
      <div className="field full match-period-config"><label>OPTIONAL MATCH PERIOD MAPPING</label>
        <small>Use video minutes, not the stadium clock. Leave both blank if the match periods have not been mapped. The mapping assumes video starts with first-half play and ends with second-half play.</small>
        <div className="period-fields">
          <div><label>FIRST HALF ENDS (VIDEO MINUTE)</label><input type="number" min="0" step="0.01" id="periodFirstEnd" defaultValue={task?.periods?.firstEnd ?? ''} placeholder="e.g. 30" /></div>
          <div><label>SECOND HALF STARTS (VIDEO MINUTE)</label><input type="number" min="0" step="0.01" id="periodSecondStart" defaultValue={task?.periods?.secondStart ?? ''} placeholder="e.g. 60 with halftime footage" /></div>
        </div><small>Example: 60-minute playing time with 30-minute halftime video → 1H ends at 30, 2H starts at 60. If halftime is omitted in the footage, both boundaries may be 30.</small>
      </div>
      <Field full title="Sponsor attribute lists (select multiple)"><GroupChoices name="sgroups" groups={data.sponsorGroups} selected={task?.sponsorGroupIds || []} /></Field>
      <Field full title="Key event attribute lists"><GroupChoices name="egroups" groups={data.eventGroups} selected={task?.eventGroupIds || []} /></Field>
      <Field full title="Camera angle attribute lists"><GroupChoices name="cgroups" groups={data.cameraGroups} selected={task?.cameraGroupIds || []} /></Field>
      <Field title="Sponsor visibility analyst"><select id="tsponsor" defaultValue={task?.sponsorAnalystId || ''}><Options users={data.users} /></select><small>Assign the same person in both fields for an all-in-one task.</small></Field>
      <Field title="Events & camera analyst"><select id="tcontext" defaultValue={task?.contextAnalystId || ''}><Options users={data.users} /></select><small>Or assign separately for two synchronized work streams.</small></Field>
      <Field title="Video source"><select id="taskvideosrc" value={sourceType} disabled={storedVideo} onChange={event => {setSourceType(event.target.value as NonNullable<TaskSummary['videoType']>);setRemoveVideo(false);}}><option value="none">Attach video later</option><option value="https">Direct HTTPS video URL</option><option value="ftp">FTP / SFTP source (metadata)</option><option value="s3">Private AWS S3 video</option></select></Field>
      <Field title="Source URL (optional)"><input id="taskurl" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} disabled={storedVideo || sourceType==='none'} placeholder="https://… or sftp://…" /><small>{storedVideo ? 'Private videos are attached in S3; this form does not delete S3 objects.' : 'The saved URL is removed when you remove the source. Local video stays on this device only.'}</small></Field>
      {task && <div className="field full task-video-removal">
        <input type="hidden" id="taskremovevideo" value={removeVideo ? 'yes' : ''} readOnly />
        <div><b>ATTACHED VIDEO</b><span>{storedVideo ? task.videoName || 'Private AWS S3 video' : removeVideo ? 'Source will be removed when you save' : localVideoName || (sourceType === 'none' ? 'No video attached' : sourceUrl || sourceType.toUpperCase())}</span></div>
        {removable && <button type="button" className="button warn" onClick={() => {setSourceType('none');setSourceUrl('');setRemoveVideo(true);}}>REMOVE VIDEO FROM TASK</button>}
        {storedVideo && <small>Private S3 video removal requires a server-side delete operation and is not available in this edit form.</small>}
      </div>}
    </div></div>
    <Footer><Cancel /><Save>{task ? 'Save changes' : 'Create task'}</Save></Footer>
  </form>;
}

function GroupModal({ group, kind }: Extract<DialogModel, { type: 'group' }>) {
  return <form onSubmit={event => { event.preventDefault(); window.saveGroup?.(kind, group?.id || ''); }}><div className="modalbody">
    <Field title="List name"><input id="gname" defaultValue={group?.name || ''} placeholder={kind === 'sponsor' ? 'Main stadium sponsors' : kind === 'event' ? 'Match moments' : 'Broadcast camera presets'} /></Field>
    {kind === 'sponsor' && <div style={{ marginTop: 15 }}><Field title="Description"><textarea id="gdesc" rows={2} defaultValue={(group as SponsorGroup | undefined)?.description || ''} placeholder="Optional" /></Field></div>}
  </div><Footer><Cancel /><Save>Save list</Save></Footer></form>;
}

function SponsorModal({ group, sponsor }: Extract<DialogModel, { type: 'sponsor' }>) {
  const [preview, setPreview] = useState(sponsor?.logo || '');
  const handleImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) { setPreview(''); return; }
    const reader = new FileReader(); reader.onload = () => setPreview(String(reader.result || '')); reader.readAsDataURL(file);
  };
  return <form onSubmit={event => { event.preventDefault(); window.saveSponsor?.(group.id, sponsor?.id || ''); }}>
    <div className="modalbody"><div className="formgrid">
      <Field full title="Sponsor name"><input id="sname" defaultValue={sponsor?.name || ''} placeholder="Brand name" required /></Field>
      <Field title="UPLOAD SPONSOR LOGO / FULL BRAND IMAGE"><input type="file" id="simage" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleImage} />
        <div id="logo-preview" className="logo-preview">{preview ? <img src={preview} alt="Sponsor logo preview" /> : 'SELECT AN IMAGE — THIS WILL APPEAR ON THE ANALYST TAGGING CARD'}</div>
        <small>Transparent margins are trimmed automatically so the brand fills the card. Existing white JPEG backgrounds require re-uploading the original transparent PNG.</small>
      </Field>
      <Field title="Fallback brand color"><input type="color" id="scolor" defaultValue={sponsor?.color || '#7059c4'} style={{ padding: 5, height: 45 }} /></Field>
    </div></div>
    <Footer><Cancel />{sponsor && <button className="button warn" type="button" onClick={() => { window.closeModal?.(); window.deleteSponsor?.(group.id, sponsor.id); }}>Delete</button>}<Save>Save sponsor</Save></Footer>
  </form>;
}

function ItemModal({ kind, groupId }: Extract<DialogModel, { type: 'item' }>) {
  return <form onSubmit={event => { event.preventDefault(); window.saveAttrItem?.(kind, groupId); }}><div className="modalbody"><div className="formgrid">
    <Field title="Attribute name"><input id="iname" placeholder={kind === 'event' ? 'Goal, replay, substitution' : 'Wide · left goal'} /></Field>
    {kind === 'event' && <div className="field full"><label className="checkline"><input type="checkbox" id="ihigh" /><span>Highlight as high-value sponsor moment (e.g., goal, trophy celebration)</span></label></div>}
  </div></div><Footer><Cancel /><Save>Add attribute</Save></Footer></form>;
}

function UserModal({ user }: Extract<DialogModel, { type: 'user' }>) {
  return <form onSubmit={event => { event.preventDefault(); window.saveUser?.(user?.id || ''); }}><div className="modalbody"><div className="formgrid">
    <Field title="Full name"><input id="uname" defaultValue={user?.name || ''} /></Field>
    <Field title="Work email"><input id="uemail" type="email" defaultValue={user?.email || ''} /></Field>
    <Field title="Role"><select id="urole" defaultValue="ANALYST"><option value="ANALYST">Analyst</option><option value="ADMIN">Administrator (workspace owner only)</option></select></Field>
    <p className="field full">A new worker receives a secure, temporary password that is shown once to you. Share it privately. Existing accounts keep their current password.</p>
  </div></div><Footer><Cancel /><Save>Add team member</Save></Footer></form>;
}

export function StudioModal({ model }: { model: DialogModel }) {
  const submitConfirm = (event: FormEvent) => { event.preventDefault(); window.acceptInAppConfirm?.(); };
  const titles: Record<DialogModel['type'], string> = {
    confirm: model.type === 'confirm' ? model.title : '', assign: 'Assign task', task: model.type === 'task' && model.task ? 'Edit match task' : 'Create new task',
    group: model.type === 'group' && model.group ? 'Edit attribute list' : 'New attribute list', sponsor: model.type === 'sponsor' && model.sponsor ? 'Edit sponsor' : 'Add a sponsor',
    item: model.type === 'item' && model.kind === 'event' ? 'Add match event' : 'Add camera angle', user: 'Add team member',
    credentials: model.type === 'credentials' ? (model.purpose === 'reset' ? 'Temporary password reset' : 'Worker account ready') : '',
  };
  return <div className="overlay" id="modal" onClick={event => { if (event.target === event.currentTarget) window.closeModal?.(); }}>
    <div className={`modal ${model.type === 'task' ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={titles[model.type]}>
      <div className="modalhead"><div><div className="eyebrow">SPONSOR INTELLIGENCE</div><h2>{titles[model.type]}</h2></div><button type="button" className="button ghost icononly" onClick={() => window.closeModal?.()} aria-label="Close dialog"><Icon name="close" /></button></div>
      {model.type === 'confirm' && <form onSubmit={submitConfirm}><div className="modalbody"><p className="confirm-message">{model.message}</p></div><Footer><Cancel /><button type="submit" className={`button ${model.danger ? 'confirm-danger' : 'primary'}`}>{model.actionLabel}</button></Footer></form>}
      {model.type === 'assign' && <AssignModal {...model} />}
      {model.type === 'task' && <TaskModal {...model} />}
      {model.type === 'group' && <GroupModal {...model} />}
      {model.type === 'sponsor' && <SponsorModal {...model} />}
      {model.type === 'item' && <ItemModal {...model} />}
      {model.type === 'user' && <UserModal {...model} />}
      {model.type === 'credentials' && <div className="modalbody">
        <p><strong>{model.name}</strong> · {model.email}</p>
        {model.temporaryPassword ? <>
          <p>Copy this one-time temporary password and share it privately with the worker. It will not appear again in Sponsor Studio.</p>
          <div className="field"><label>ONE-TIME TEMPORARY PASSWORD</label><code id="temporaryPassword" style={{display:'block',wordBreak:'break-all',padding:14,background:'#181818',borderRadius:8}}>{model.temporaryPassword}</code></div>
          <button type="button" className="button soft" onClick={() => void navigator.clipboard?.writeText(model.temporaryPassword!) }>Copy password</button>
          <p className="infohint">This password expires in 7 days and must be changed on first sign-in. No email or other message is sent by the platform.</p>
        </> : <p>This person already has an account. Their existing password is unchanged. No new password was generated.</p>}
        <Footer><button type="button" className="button primary" onClick={() => window.closeModal?.()}>Done</button></Footer>
      </div>}
    </div>
  </div>;
}

declare global {
  interface Window {
    closeModal?: () => void;
    acceptInAppConfirm?: () => void;
    saveTaskAssignment?: (id: string) => void;
    saveTask?: (id: string) => void;
    selectFixture?: (id: string) => void;
    saveGroup?: (kind: 'sponsor' | 'event' | 'camera', id: string) => void;
    saveSponsor?: (groupId: string, sponsorId: string) => void;
    deleteSponsor?: (groupId: string, sponsorId: string) => void;
    saveAttrItem?: (kind: 'event' | 'camera', groupId: string) => void;
    saveUser?: (id: string) => void;
  }
}
