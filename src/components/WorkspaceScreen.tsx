export function WorkspaceScreen({workspaces}:{workspaces:{id:string;name:string;slug:string}[]}) {
  return <div className="login-page">
    <header className="login-top"><div className="identity-lockup"><img src="assets/mc26-wordmark.svg" alt="Messi Cup 2026" /></div><span>SPONSOR INTELLIGENCE</span></header>
    <main className="login-central">
      <img className="login-wordmark" src="assets/mc26-wordmark.svg" alt="Messi Cup 2026" />
      <div className="login-kicker">MATCH OPERATIONS / ORGANIZATION</div>
      <h1>{workspaces.length ? 'SELECT WORKSPACE.' : 'NO WORKSPACE ASSIGNED.'}</h1>
      {workspaces.length>0 && <div className="demo-roles">{workspaces.map(w=><button key={w.id} type="button" onClick={()=>window.selectWorkspace?.(w.id)}>{w.name}</button>)}</div>}
      {!workspaces.length && <p className="workspace-access-note">Ask your administrator to assign you to the existing Sponsor Studio workspace.</p>}
      <button className="button ghost auth-back" onClick={()=>window.logout?.()}>SIGN OUT</button>
    </main>
    <footer className="login-footer"><span>SEEBOT SPONSOR STUDIO</span><span>SECURE WORKSPACE ACCESS</span></footer>
  </div>;
}

declare global {
  interface Window {
    selectWorkspace?: (id:string)=>void;
  }
}
