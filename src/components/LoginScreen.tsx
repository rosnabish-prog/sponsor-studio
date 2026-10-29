import type { FormEvent } from 'react';
import { apiEnabled } from '../api/client';

function ArrowIcon() {
  return <svg className="ic"><use href="#i-arrow" /></svg>;
}

export function LoginScreen({ forgot, registering = false, resetToken = '' }: { forgot: boolean; registering?: boolean;resetToken?:string }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (registering) window.register?.(event);
    else if (apiEnabled && resetToken) window.confirmPasswordReset?.(event);
    else if (forgot) apiEnabled ? window.requestPasswordReset?.(event) : window.resetDemo?.(event);
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
        <h1>{registering ? 'CREATE ACCOUNT.' : resetToken ? 'NEW PASSWORD.' : forgot ? apiEnabled ? 'RESET PASSWORD.' : 'RESET DEMO ACCESS' : 'SIGN IN.'}</h1>
        <p>{resetToken ? 'Choose a new password. Completing this reset ends all existing sessions for your account.' : forgot
          ? apiEnabled ? 'Enter your account email. If an account exists, we will email a 30-minute recovery link.' : 'For this demonstration, change a local demo account password. Production email recovery requires a server.'
          : registering ? 'Create your secure account and a workspace for your team.' : 'Access your assigned matches, track sponsor visibility, and analyze key broadcast moments.'}</p>
        <form id="signInForm" className="loginform" onSubmit={submit}>
          {registering && <>
            <div className="field"><label htmlFor="regname">FULL NAME</label><input id="regname" type="text" maxLength={150} placeholder="Your name" autoComplete="name" required /></div>
            <div className="field"><label htmlFor="regorg">ORGANIZATION NAME</label><input id="regorg" type="text" maxLength={150} placeholder="Your company" required /></div>
          </>}
          {!resetToken && <div className="field">
            <label htmlFor="loginemail">EMAIL ADDRESS</label>
            <input id="loginemail" name="email" type="email" placeholder="name@organization.com" autoComplete="username" required />
          </div>}
          {apiEnabled && resetToken ? <>
            <div className="field"><label htmlFor="newpwd">NEW PASSWORD</label><input id="newpwd" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></div>
            <div className="field"><label htmlFor="confirmnewpwd">CONFIRM NEW PASSWORD</label><input id="confirmnewpwd" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></div>
          </> : forgot && !registering && !apiEnabled ? (
            <div className="field">
              <label htmlFor="newpwd">NEW DEMO PASSWORD</label>
              <input id="newpwd" type="password" minLength={8} placeholder="Minimum 8 characters" autoComplete="new-password" required />
            </div>
          ) : apiEnabled && forgot ? null : (
            <div className="field">
              <div className="row between">
                <label htmlFor="loginpass">PASSWORD</label>
                {!registering && !forgot && <a href="#" onClick={event => { event.preventDefault(); window.toggleForgot?.(true); }}>Forgot password?</a>}
              </div>
              <input id="loginpass" name="password" type="password" minLength={apiEnabled?12:undefined} placeholder="Enter password" autoComplete={registering?'new-password':'current-password'} required />
            </div>
          )}
          <div id="authError" role="alert" aria-live="polite" className="auth-error" />
          <button className="button primary auth-submit" type="submit">
            {registering ? 'CREATE ACCOUNT' : resetToken ? 'SAVE NEW PASSWORD' : forgot ? apiEnabled ? 'EMAIL RESET LINK' : 'RESET PASSWORD' : 'SIGN IN'} <ArrowIcon />
          </button>
          {(forgot || resetToken) && <button type="button" className="button ghost auth-back" onClick={() => window.toggleForgot?.(false)}>BACK TO SIGN IN</button>}
        </form>
        {apiEnabled && !forgot && !resetToken ? <p className="demo-password">
          <button type="button" onClick={() => window.toggleRegister?.(!registering)}>{registering?'ALREADY REGISTERED? SIGN IN':'NEW ORGANIZATION? CREATE ACCOUNT'}</button>
        </p> : !apiEnabled ? <>
          <div className="demo-line"><span>DEMO ACCESS</span><span>NO LIVE USER ACCOUNTS CONNECTED</span></div>
          <div className="demo-roles">
            <button type="button" onClick={() => window.fillDemo?.('admin@demo.seebot.ai')}>USE ADMIN ACCOUNT</button>
            <button type="button" onClick={() => window.fillDemo?.('analyst@demo.seebot.ai')}>USE ANALYST ACCOUNT</button>
            <button type="button" onClick={() => window.fillDemo?.('events@demo.seebot.ai')}>EVENTS ANALYST</button>
          </div>
          <p className="demo-password">
            <span className="demo-password-hint">Demo password: <code>Demo1234!</code></span>
            <button type="button" onClick={() => window.resetDemoData?.()}>RESET DEMO</button>
          </p>
        </> : null}
      </main>
      <footer className="login-footer">
        <span>MESSI CUP 26' / SPONSOR INTELLIGENCE</span>
        <span>{apiEnabled?'SECURE WORKSPACE SIGN IN':'LOCAL PROTOTYPE · NOT PRODUCTION AUTHENTICATION'}</span>
      </footer>
    </div>
  );
}

declare global {
  interface Window {
    login?: (event: FormEvent<HTMLFormElement>) => void;
    resetDemo?: (event: FormEvent<HTMLFormElement>) => void;
    toggleForgot?: (forgot: boolean) => void;
    fillDemo?: (email: string) => void;
    resetDemoData?: () => void;
    register?: (event: FormEvent<HTMLFormElement>) => void;
    toggleRegister?: (enabled:boolean)=>void;
    requestPasswordReset?:(event:FormEvent<HTMLFormElement>)=>void;
    confirmPasswordReset?:(event:FormEvent<HTMLFormElement>)=>void;
  }
}
