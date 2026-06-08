'use client';

import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';

/** Email-OTP login + "Try Demo". Shown when there is no session. */
export default function AuthGate({ onAuthed }: { onAuthed: () => void }) {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [resending, setResending] = useState(false);
  const MAX_RESENDS = 3;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestOtp = async () => {
    const addr = email.trim();
    if (!addr) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not send code.');
      setNote(null);
      setResendCount(0);
      setCooldown(30);
      setStep('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || resending || busy || resendCount >= MAX_RESENDS) return;
    setResending(true);
    setError(null);
    setNote(null);
    try {
      const r = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not resend the code.');
      setResendCount((c) => c + 1);
      setNote('A new code has been sent.');
      setCooldown(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResending(false);
    }
  };

  const verify = async () => {
    setNote(null);
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Invalid code.');
      onAuthed();
      // success: keep the button disabled/"Verifying…" until this screen unmounts,
      // so it never flashes back to "Verify & sign in".
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const tryDemo = async () => {
    setDemoBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/demo', { method: 'POST' });
      if (!r.ok) throw new Error('Could not start demo.');
      onAuthed();
      // success: stay disabled until this screen unmounts (no flash back).
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDemoBusy(false);
    }
  };

  return (
    <div className="authwrap">
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>
      <div className="authcard">
        <div className="auth-brand">
          <svg className="auth-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="currentColor" />
          </svg>
          <span>PlantPulse&nbsp;AI</span>
        </div>
        <p className="auth-tag">Operational intelligence, powered by Exasol.</p>

        {step === 'email' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              requestOtp();
            }}
          >
            <label className="auth-label">Sign in with email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              aria-label="Email"
              autoFocus
            />
            <button className="btn auth-btn" type="submit" disabled={busy || demoBusy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            <label className="auth-label">
              Enter the 6-digit code sent to <strong>{email.trim()}</strong>
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="••••••"
              aria-label="Code"
              autoFocus
              style={{ textAlign: 'center', letterSpacing: '0.4em', fontFamily: 'var(--font-plex-mono), monospace' }}
            />
            <button className="btn auth-btn" type="submit" disabled={busy || demoBusy}>
              {busy ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <div className="auth-actions">
              {resendCount >= MAX_RESENDS ? (
                <span className="auth-linkb auth-linkb-off">Resend limit reached</span>
              ) : (
                <button type="button" className="auth-linkb" onClick={resend} disabled={cooldown > 0 || resending || busy}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
                </button>
              )}
              <span className="auth-sep">·</span>
              <button
                type="button"
                className="auth-linkb"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                  setNote(null);
                  setCooldown(0);
                  setResendCount(0);
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}

        {error && <div className="auth-err">{error}</div>}
        {note && <div className="auth-note">{note}</div>}

        <div className="auth-divider"><span>or</span></div>
        <button type="button" className="auth-demo" onClick={tryDemo} disabled={busy || demoBusy}>
          {demoBusy ? 'Starting demo…' : 'Try Demo without signing in →'}
        </button>
        <footer className="auth-credit">Built by Appili Vamsi Krishna · Exasol Prototype Challenge</footer>
      </div>
    </div>
  );
}
