import type { FormEvent } from 'react';

export function WorkspaceScreen({workspaces}:{workspaces:{id:string;name:string;slug:string}[]}) {
  const submit=(event:FormEvent<HTMLFormElement>)=>window.createWorkspace?.(event);
  return <div className="login-page">
    <header className="login-top"><div className="identity-lockup"><img src="assets/mc26-wordmark.svg" alt="Messi Cup 2026" /></div><span>SPONSOR INTELLIGENCE</span></header>
    <main className="login-central">
      <img className="login-wordmark" src="assets/mc26-wordmark.svg" alt="Messi Cup 2026" />
      <div className="login-kicker">MATCH OPERATIONS / ORGANIZATION</div>
      <h1>SELECT WORKSPACE.</h1>
      {workspaces.length>0 && <div className="demo-roles">{workspaces.map(w=><button key={w.id} type="button" onClick={()=>window.selectWorkspace?.(w.id)}>{w.name}</button>)}</div>}
      <form className="loginform" onSubmit={submit}>
        <div className="field"><label htmlFor="newWorkspaceName">CREATE A WORKSPACE</label><input id="newWorkspaceName" type="text" minLength={2} maxLength={150} placeholder="Organization name" required /></div>
        <button className="button primary auth-submit" type="submit">CREATE WORKSPACE</button>
      </form>
      <button className="button ghost auth-back" onClick={()=>window.logout?.()}>SIGN OUT</button>
    </main>
    <footer className="login-footer"><span>SEEBOT SPONSOR STUDIO</span><span>SECURE WORKSPACE ACCESS</span></footer>
  </div>;
}

declare global {
  interface Window {
    createWorkspace?: (event:FormEvent<HTMLFormElement>)=>void;
    selectWorkspace?: (id:string)=>void;
  }
}
