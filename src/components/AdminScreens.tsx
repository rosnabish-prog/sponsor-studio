import { useState, type DragEvent } from 'react';
import type { Sponsor, SponsorGroup, StudioData, TagGroup, TeamMember } from '../types/models';
import { displayHotkey } from '../domain/hotkeys';
import type { CatalogKind, DropPlacement } from '../domain/catalogEditing';

function Icon({ name }: { name: string }) {
  return <svg className="ic"><use href={`#i-${name}`} /></svg>;
}

function BrandThumb({ sponsor }: { sponsor: Sponsor }) {
  const initials = sponsor.name.split(' ').map(part => part[0]).join('').slice(0, 3).toUpperCase();
  return (
    <div
      className="tinylogo "
      style={sponsor.logo ? undefined : {
        background: `${sponsor.color || '#f2eff8'}25`,
        color: sponsor.color || '#665b87',
      }}
    >
      {sponsor.logo ? <img src={sponsor.logo} alt="" /> : initials}
    </div>
  );
}

type DraggedCatalog = { scope: 'item' | 'group'; kind: CatalogKind; groupId: string; id: string };
const DRAG_TYPE = 'application/x-seebot-catalog';

function CatalogGroups({ kind, groups }: { kind: CatalogKind; groups: SponsorGroup[] | TagGroup[] }) {
  const [dragged, setDragged] = useState<DraggedCatalog | null>(null);
  const [hover, setHover] = useState('');
  const startDrag = (event: DragEvent<HTMLElement>, source: DraggedCatalog) => {
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(source));
    setDragged(source);
  };
  const dragSource = (event: DragEvent<HTMLElement>) => {
    if (dragged) return dragged;
    try {
      const value = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as DraggedCatalog;
      if (value.kind === kind && (value.scope === 'item' || value.scope === 'group')) return value;
    } catch { /* Ignore drags from outside the catalog. */ }
    return null;
  };
  const allow = (event: DragEvent<HTMLElement>, target: string, destinationGroup: string, scope?: 'item' | 'group') => {
    if (!dragged || dragged.kind !== kind || (scope && dragged.scope !== scope)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = dragged.scope === 'group' || dragged.groupId === destinationGroup ? 'move' : 'copy';
    setHover(previous => previous === target ? previous : target);
  };
  const placement = (event: DragEvent<HTMLElement>): DropPlacement => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
  };
  const drop = (event: DragEvent<HTMLElement>, destinationGroup: string, targetItem?: string) => {
    const source = dragSource(event);
    if (!source || source.kind !== kind || (targetItem && source.scope !== 'item')) return;
    event.preventDefault();event.stopPropagation();
    const where = targetItem ? placement(event) : 'after';
    setDragged(null);setHover('');
    if (source.scope === 'group') window.moveCatalogGroup?.(kind, source.id, destinationGroup, placement(event));
    else window.moveCatalogItem?.(kind, source.groupId, source.id, destinationGroup, targetItem || '', where);
  };
  return <div className="library-layout catalog-organizer" onDragEnd={() => { setDragged(null);setHover(''); }}>
    {groups.map((group, groupIndex) => {
      const entries = kind === 'sponsor' ? (group as SponsorGroup).sponsors : (group as TagGroup).items;
      return <div className={`card groupcard catalog-group ${hover === `group:${group.id}` ? 'catalog-drop-over' : ''}`} key={group.id}
        onDragOver={event => allow(event, `group:${group.id}`,group.id)} onDrop={event => drop(event, group.id)}>
        <div className="grouphead">
          <div className="catalog-group-heading">
            <span draggable className="catalog-drag-handle" title={`Drag to reorder ${group.name} list`} onDragStart={event => startDrag(event, {scope:'group',kind,groupId:group.id,id:group.id})}>⠿</span>
            <div><h3>{group.name}</h3><p>{kind === 'sponsor' ? ((group as SponsorGroup).description || 'Reusable sponsor list') : 'Reusable attribute list'} · {entries.length} {kind === 'sponsor' ? 'sponsors' : 'attributes'}</p></div>
          </div>
          <div className="catalog-group-actions">
            <button type="button" className="button ghost tiny" disabled={!groupIndex} title="Move list up" aria-label={`Move ${group.name} list up`} onClick={() => window.moveCatalogGroup?.(kind,group.id,groups[groupIndex-1]?.id,'before')}>↑</button>
            <button type="button" className="button ghost tiny" disabled={groupIndex===groups.length-1} title="Move list down" aria-label={`Move ${group.name} list down`} onClick={() => window.moveCatalogGroup?.(kind,group.id,groups[groupIndex+1]?.id,'after')}>↓</button>
            <button type="button" className="button ghost tiny" onClick={() => window.groupModal?.(kind, group.id)}>Edit</button>
          </div>
        </div>
        <div className="groupitems catalog-items" onDragOver={event => allow(event, `group:${group.id}`,group.id, 'item')} onDrop={event => drop(event, group.id)}>
          {entries.map((item, index) => <div className={`sponsor-mini catalog-item ${hover.startsWith(`item:${group.id}:${item.id}:`) ? 'catalog-drop-over' : ''} ${hover === `item:${group.id}:${item.id}:before` ? 'catalog-drop-before' : ''} ${hover === `item:${group.id}:${item.id}:after` ? 'catalog-drop-after' : ''}`} key={item.id}
            onDragOver={event => { if(dragged?.scope==='item'){event.stopPropagation();allow(event, `item:${group.id}:${item.id}:${placement(event)}`,group.id,'item');} }}
            onDrop={event => drop(event,group.id,item.id)}>
            <span draggable className="catalog-drag-handle" title={`Drag ${item.name} to reorder · drop in another list to copy`} onDragStart={event => {event.stopPropagation();startDrag(event,{scope:'item',kind,groupId:group.id,id:item.id});}}>⠿</span>
            {kind === 'sponsor' && <BrandThumb sponsor={item as Sponsor} />}
            <span className="catalog-item-name">{item.name}{item.hotkey && <kbd className="hotkey-hint">{displayHotkey(item.hotkey)}</kbd>}{kind==='event' && 'highValue' in item && item.highValue===true && <span className="tag">HIGH VALUE</span>}</span>
            <div className="catalog-item-actions">
              <button type="button" className="button ghost tiny" disabled={!index} title="Move up" aria-label={`Move ${item.name} up`} onClick={() => window.moveCatalogItem?.(kind,group.id,item.id,group.id,entries[index-1]?.id,'before')}>↑</button>
              <button type="button" className="button ghost tiny" disabled={index===entries.length-1} title="Move down" aria-label={`Move ${item.name} down`} onClick={() => window.moveCatalogItem?.(kind,group.id,item.id,group.id,entries[index+1]?.id,'after')}>↓</button>
              <button type="button" className="button ghost tiny" onClick={() => window.copyCatalogItem?.(kind,group.id,item.id)} title="Copy into another list">Copy</button>
              <button type="button" className="button ghost tiny" onClick={() => kind==='sponsor' ? window.sponsorModal?.(group.id,item.id) : window.attrItemModal?.(kind,group.id,item.id)}>{kind==='sponsor'?'Edit / logo':'Edit'}</button>
              <button type="button" className="button warn tiny" title={`Delete ${item.name}`} onClick={() => kind==='sponsor' ? window.deleteSponsor?.(group.id,item.id) : window.removeItem?.(kind,group.id,item.id)}>Delete</button>
            </div>
          </div>)}
        </div>
        <div className="catalog-group-footer">
          <button type="button" className="button soft tiny" onClick={() => kind==='sponsor' ? window.sponsorModal?.(group.id) : window.attrItemModal?.(kind,group.id)}><Icon name="plus" /> Add {kind==='sponsor'?'sponsor':'attribute'}</button>
          <button type="button" className="button ghost tiny" onClick={() => window.pasteCatalogItem?.(kind,group.id)}>Paste here</button>
        </div>
      </div>;
    })}
  </div>;
}

export function SponsorLibraryScreen({ data }: { data: StudioData }) {
  return <>
    <div className="pagehead"><div><div className="eyebrow">SETUP / BRAND CATALOG</div><h1>Sponsor library</h1>
      <p className="sub">Reorder with the drag handles or arrows. Drag into another list to copy, or use Copy and Paste here.</p>
    </div><button className="button primary" onClick={() => window.groupModal?.('sponsor')}><Icon name="plus" /> New sponsor list</button></div>
    <CatalogGroups kind="sponsor" groups={data.sponsorGroups} />
  </>;
}

function AttributeCategory({ kind, title, groups }: { kind: 'event' | 'camera'; title: string; groups: TagGroup[] }) {
  return <>
    <div className="sectionhead" style={{ margin: '30px 0 15px' }}><h2>{title}</h2>
      <button className="button primary tiny" onClick={() => window.groupModal?.(kind)}><Icon name="plus" /> New list</button></div>
    <CatalogGroups kind={kind} groups={groups} />
  </>;
}

export function AttributesScreen({ data }: { data: StudioData }) {
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">SETUP / TAG ONTOLOGY</div>
          <h1>Tagging attributes</h1>
          <p className="sub">Reorder event and camera buttons with the drag handles or arrows. Changes appear in Annotation Studio in the same order.</p>
        </div>
      </div>
      <AttributeCategory kind="event" title="Key event attributes" groups={data.eventGroups} />
      <AttributeCategory kind="camera" title="Camera angle attributes" groups={data.cameraGroups} />
    </>
  );
}

export function TeamScreen({ data, viewerRole }: { data: StudioData; viewerRole?: TeamMember['role'] }) {
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">WORKSPACE / PEOPLE</div>
          <h1>Team &amp; access</h1>
          <p className="sub">Only the workspace owner can remove admins, analysts, and viewers. Existing match annotations are kept.</p>
        </div>
        <button className="button primary" onClick={() => window.userModal?.()}><Icon name="plus" /> Add team member</button>
      </div>
      <div className="card cardpad">
        <div className="tablewrap">
          <table className="table">
            <thead><tr><th>Team member</th><th>Role</th><th>Email</th><th>Active assignments</th><th>Actions</th></tr></thead>
            <tbody>
              {data.users.map(user => (
                <tr key={user.id}>
                  <td><div className="row"><div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div><b>{user.name}</b></div></td>
                  <td><span className={`tag ${user.role === 'owner'||user.role === 'admin' ? 'pink' : ''}`}>{user.role === 'owner' ? 'Owner' : user.role === 'admin' ? 'Admin' : user.role === 'viewer' ? 'Viewer' : 'Analyst'}</span></td>
                  <td>{user.email}</td>
                  <td>{data.tasks.filter(task => task.sponsorAnalystId === user.id || task.contextAnalystId === user.id).length}</td>
                  <td><div className="row">
                    {user.role !== 'owner' && (viewerRole === 'owner' || user.role !== 'admin') && <button className="button ghost tiny" onClick={() => window.resetMemberPassword?.(user.id)}>Reset password</button>}
                    {viewerRole === 'owner' && user.role !== 'owner' && <button className="button warn tiny" onClick={() => window.removeWorkspaceMember?.(user.id)} aria-label={`Remove ${user.name}`}>Remove</button>}
                    {user.role === 'owner' && <span className="tag">Protected</span>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="infohint">Removed members lose access to this workspace, while their annotations and other workspace memberships remain intact. New temporary passwords are shown only once. Sponsor Studio sends no emails.</div>
    </>
  );
}

declare global {
  interface Window {
    copyCatalogItem?: (kind:CatalogKind, groupId:string, itemId:string)=>void;
    pasteCatalogItem?: (kind:CatalogKind, groupId:string)=>void;
    moveCatalogItem?: (kind:CatalogKind, sourceGroupId:string, sourceItemId:string, targetGroupId:string, targetItemId?:string, placement?:DropPlacement)=>void;
    moveCatalogGroup?: (kind:CatalogKind, groupId:string, targetGroupId:string, placement?:DropPlacement)=>void;
    groupModal?: (kind: 'sponsor' | 'event' | 'camera', id?: string) => void;
    sponsorModal?: (groupId: string, sponsorId?: string) => void;
    deleteSponsor?: (groupId: string, sponsorId: string) => void;
    attrItemModal?: (kind: 'event' | 'camera', groupId: string, itemId?: string) => void;
    removeItem?: (kind: 'event' | 'camera', groupId: string, id: string) => void;
    userModal?: (id?: string) => void;
    resetMemberPassword?: (id: string) => void;
    removeWorkspaceMember?: (id: string) => void;
  }
}
