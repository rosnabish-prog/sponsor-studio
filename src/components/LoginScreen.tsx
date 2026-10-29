import type { FormEvent } from 'react';

function ArrowIcon() {
  return <svg className="ic"><use href="#i-arrow" /></svg>;
}

export function LoginScreen({ changeRequired = false }: { changeRequired?:boolean }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (changeRequired) window.changeOwnPassword?.(event);
    else window.login?.(event);
  };

  return (
    <div className="login-page">
      <header className="login-top">
        <div className="identity-lockup">
          <img src="assets/mc26-wordmark.svg" alt="Messi Cup 2026" />
          <span className="powered-by">
            <span>POWERED BY</span>
            <img src="assets/seebot-wordmark-orange-20261029.svg" alt="Seebot" loading="eager" />
          </span>
        </div>
        <span>2026 TOURNAMENT <b>·</b> OCT 25 – NOV 1</span>
      </header>
      <main className="login-central">
        <img className="login-wordmark" src="assets/mc26-wordmark.svg" alt="Messi Cup 2026" />
        <div className="login-kicker">SPONSOR INTELLIGENCE / MATCH OPERATIONS</div>
        <h1>{changeRequired ? 'SET YOUR PASSWORD.' : 'SIGN IN.'}</h1>
        <p>{changeRequired ? 'Your administrator issued a temporary password. Choose a personal password to unlock your workspace. You will sign in again afterward.' : 'Access your assigned matches, track sponsor visibility, and analyze key broadcast moments.'}</p>
        <form id="signInForm" className="loginform" onSubmit={submit}>
          {!changeRequired && <div className="field">
            <label htmlFor="loginemail">EMAIL ADDRESS</label>
            <input id="loginemail" name="email" type="email" placeholder="name@organization.com" autoComplete="username" required />
          </div>}
          {changeRequired ? <>
            <div className="field"><label htmlFor="currentpwd">TEMPORARY PASSWORD</label><input id="currentpwd" type="password" minLength={12} maxLength={128} autoComplete="current-password" required /></div>
            <div className="field"><label htmlFor="newpwd">NEW PASSWORD</label><input id="newpwd" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></div>
            <div className="field"><label htmlFor="confirmnewpwd">CONFIRM NEW PASSWORD</label><input id="confirmnewpwd" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></div>
          </> : (
            <div className="field">
              <div className="row between">
                <label htmlFor="loginpass">PASSWORD</label>
              </div>
              <input id="loginpass" name="password" type="password" minLength={12} placeholder="Enter password" autoComplete="current-password" required />
            </div>
          )}
          <div id="authError" role="alert" aria-live="polite" className="auth-error" />
          <button className="button primary auth-submit" type="submit">
            {changeRequired ? 'SET PASSWORD' : 'SIGN IN'} <ArrowIcon />
          </button>
        </form>
        {!changeRequired && <p className="demo-password">
          <span className="demo-password-hint">Forgot your password? Ask your administrator to reset it.</span>
        </p>}
      </main>
      <footer className="login-footer">
        <span>MESSI CUP 26' / SPONSOR INTELLIGENCE</span>
        <span>SECURE WORKSPACE SIGN IN</span>
      </footer>
    </div>
  );
}

declare global {
  interface Window {
    login?: (event: FormEvent<HTMLFormElement>) => void;
    changeOwnPassword?:(event:FormEvent<HTMLFormElement>)=>void;
  }
}
