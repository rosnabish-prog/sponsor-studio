import type { Sponsor, StudioData, TagGroup } from '../types/models';

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

export function SponsorLibraryScreen({ data }: { data: StudioData }) {
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">SETUP / BRAND CATALOG</div>
          <h1>Sponsor library</h1>
          <p className="sub">Organize sponsors into reusable groups. Upload a logo or full-brand image for each.</p>
        </div>
        <button className="button primary" onClick={() => window.groupModal?.('sponsor')}><Icon name="plus" /> New sponsor list</button>
      </div>
      <div className="library-layout">
        {data.sponsorGroups.map(group => (
          <div className="card groupcard" key={group.id}>
            <div className="grouphead">
              <div>
                <h3>{group.name}</h3>
                <p>{group.description || 'Reusable sponsor attribute list'} · {group.sponsors.length} sponsors</p>
              </div>
              <button className="button ghost tiny" onClick={() => window.groupModal?.('sponsor', group.id)}>Edit</button>
            </div>
            <div className="groupitems">
              {group.sponsors.map(sponsor => (
                <div className="sponsor-mini" key={sponsor.id}>
                  <BrandThumb sponsor={sponsor} />{sponsor.name}{' '}
                  <button className="button ghost tiny" onClick={() => window.sponsorModal?.(group.id, sponsor.id)} title="Replace or upload logo">UPLOAD / EDIT</button>
                  <button className="button warn tiny" onClick={() => window.deleteSponsor?.(group.id, sponsor.id)} title="Delete sponsor">DELETE</button>
                </div>
              ))}
            </div>
            <button className="button soft tiny" style={{ marginTop: 17 }} onClick={() => window.sponsorModal?.(group.id)}><Icon name="plus" /> Add sponsor</button>
          </div>
        ))}
      </div>
    </>
  );
}

function AttributeCategory({ kind, title, groups }: { kind: 'event' | 'camera'; title: string; groups: TagGroup[] }) {
  return (
    <>
      <div className="sectionhead" style={{ margin: '30px 0 15px' }}>
        <h2>{title}</h2>
        <button className="button primary tiny" onClick={() => window.groupModal?.(kind)}><Icon name="plus" /> New list</button>
      </div>
      <div className="library-layout">
        {groups.map(group => (
          <div className="card groupcard" key={group.id}>
            <div className="grouphead">
              <div><h3>{group.name}</h3><p>{group.items.length} attributes</p></div>
              <button className="button ghost tiny" onClick={() => window.groupModal?.(kind, group.id)}>Edit</button>
            </div>
            <div className="groupitems">
              {group.items.map(item => (
                <span className="sponsor-mini" key={item.id}>
                  {item.name} {kind === 'event' && item.highValue === true && <span className="tag">HIGH VALUE</span>}{' '}
                  <button className="button ghost tiny" style={{ padding: '3px 5px' }} title="Remove attribute" onClick={() => window.removeItem?.(kind, group.id, item.id)}><Icon name="close" /></button>
                </span>
              ))}
            </div>
            <button className="button soft tiny" style={{ marginTop: 17 }} onClick={() => window.attrItemModal?.(kind, group.id)}><Icon name="plus" /> Add attribute</button>
          </div>
        ))}
      </div>
    </>
  );
}

export function AttributesScreen({ data }: { data: StudioData }) {
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">SETUP / TAG ONTOLOGY</div>
          <h1>Tagging attributes</h1>
          <p className="sub">Create reusable event and camera presets that match different client requirements.</p>
        </div>
      </div>
      <AttributeCategory kind="event" title="Key event attributes" groups={data.eventGroups} />
      <AttributeCategory kind="camera" title="Camera angle attributes" groups={data.cameraGroups} />
    </>
  );
}

export function TeamScreen({ data }: { data: StudioData }) {
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">WORKSPACE / PEOPLE</div>
          <h1>Analysts &amp; access</h1>
          <p className="sub">Assign either one analyst to both streams or two analysts to split tagging responsibilities.</p>
        </div>
        <button className="button primary" onClick={() => window.userModal?.()}><Icon name="plus" /> Add analyst</button>
      </div>
      <div className="card cardpad">
        <div className="tablewrap">
          <table className="table">
            <thead><tr><th>Team member</th><th>Role</th><th>Email</th><th>Active assignments</th><th /></tr></thead>
            <tbody>
              {data.users.map(user => (
                <tr key={user.id}>
                  <td><div className="row"><div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div><b>{user.name}</b></div></td>
                  <td><span className={`tag ${user.role === 'admin' ? 'pink' : ''}`}>{user.role}</span></td>
                  <td>{user.email}</td>
                  <td>{data.tasks.filter(task => task.sponsorAnalystId === user.id || task.contextAnalystId === user.id).length}</td>
                  <td>{user.role === 'analyst' && <button className="button ghost tiny" onClick={() => window.resetMemberPassword?.(user.id)}>Reset password</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="infohint">Accounts are managed by administrators. New temporary passwords are shown only once and must be changed on first sign-in. Sponsor Studio sends no emails.</div>
    </>
  );
}

declare global {
  interface Window {
    groupModal?: (kind: 'sponsor' | 'event' | 'camera', id?: string) => void;
    sponsorModal?: (groupId: string, sponsorId?: string) => void;
    deleteSponsor?: (groupId: string, sponsorId: string) => void;
    attrItemModal?: (kind: 'event' | 'camera', groupId: string) => void;
    removeItem?: (kind: 'event' | 'camera', groupId: string, id: string) => void;
    userModal?: (id?: string) => void;
    resetMemberPassword?: (id: string) => void;
  }
}
