'use client';

import { useState } from 'react';

/** Light/dark toggle. Base (no attribute) = dark; [data-theme="light"] = light.
 *  The no-FOUC script in layout.tsx sets the initial attribute before paint, so
 *  we read the real theme lazily during render (no setState-in-effect). The
 *  button is marked suppressHydrationWarning because the server renders the
 *  default icon while the client renders the persisted one. */
const readTheme = (): 'dark' | 'light' => {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
};

const ThemeToggle = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      type="button"
      suppressHydrationWarning
    >
      {theme === 'dark' ? (
        // sun (click to switch to light)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8" />
        </svg>
      ) : (
        // moon (click to switch to dark)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
};

export default ThemeToggle;
