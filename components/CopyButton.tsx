'use client';

import { useState } from 'react';

/** Small copy-to-clipboard button, positioned top-right of a code block. */
const CopyButton = ({ text, label = 'SQL' }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      className={`copy-btn ${copied ? 'copied' : ''}`}
      onClick={copy}
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      type="button"
    >
      {copied ? '✓ copied' : '⧉ copy'}
    </button>
  );
};

export default CopyButton;
