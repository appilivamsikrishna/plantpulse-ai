'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

/** Architecture page hero: heading + subtitle on the left, an animation on/off
 *  toggle and an "Expand" button top-right, the theme-swapped inline diagram,
 *  and a full-screen pan + pinch-zoom viewer. The animation toggle is shared
 *  state: turning it off swaps the animated SVG for a static one both inline and
 *  inside the viewer, so the page and the viewer always match. */

/** the static (non-animated) twin lives next to the animated file: foo.svg -> foo-static.svg */
const staticOf = (u: string) => u.replace(/\.svg$/, '-static.svg');

export default function ArchitectureHero({
  label,
  heading,
  subtitle,
  dark,
  light,
  alt,
}: {
  label: string;
  heading: ReactNode;
  subtitle: string;
  dark: string;
  light: string;
  alt: string;
}) {
  const [open, setOpen] = useState(false);
  const [animated, setAnimated] = useState(true);
  const [isLight, setIsLight] = useState(false);

  const pick = (lightTheme: boolean, anim: boolean) => {
    const base = lightTheme ? light : dark;
    return anim ? base : staticOf(base);
  };

  const openModal = () => {
    const lightNow =
      typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
    setIsLight(lightNow);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <section className="hero arch-hero" style={{ paddingBottom: 6 }}>
        <div className="arch-hero-text">
          <div className="label">{label}</div>
          <h1 style={{ fontSize: 'clamp(28px,3.6vw,40px)' }}>{heading}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="arch-hero-actions">
          <button
            className={`anim-toggle${animated ? ' on' : ''}`}
            type="button"
            onClick={() => setAnimated((a) => !a)}
            aria-pressed={animated}
            title={animated ? 'Turn animation off' : 'Turn animation on'}
          >
            <span className="anim-dot" />
            Animation {animated ? 'on' : 'off'}
          </button>
          <button className="open-full" type="button" onClick={openModal}>
            Expand ↗
          </button>
        </div>
      </section>

      <div className="panel" style={{ padding: 14, overflowX: 'auto', marginTop: 4 }}>
        {/* eslint-disable @next/next/no-img-element */}
        <img className="diagram-dark" src={animated ? dark : staticOf(dark)} alt={alt} />
        <img className="diagram-light" src={animated ? light : staticOf(light)} alt={alt} />
        {/* eslint-enable @next/next/no-img-element */}
      </div>

      {open && (
        <div className="dv-overlay" role="dialog" aria-modal="true" aria-label={alt}>
          <TransformWrapper
            minScale={0.3}
            maxScale={10}
            initialScale={1}
            centerOnInit
            limitToBounds={false}
            doubleClick={{ mode: 'zoomIn', step: 0.7 }}
            wheel={{ step: 0.12 }}
            pinch={{ step: 5 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="dv-toolbar">
                  <button
                    className={`anim-toggle${animated ? ' on' : ''}`}
                    onClick={() => setAnimated((a) => !a)}
                    aria-pressed={animated}
                    title={animated ? 'Turn animation off' : 'Turn animation on'}
                  >
                    <span className="anim-dot" />
                    Animation {animated ? 'on' : 'off'}
                  </button>
                  <button onClick={() => zoomIn()} aria-label="Zoom in">＋</button>
                  <button onClick={() => zoomOut()} aria-label="Zoom out">－</button>
                  <button onClick={() => resetTransform()}>reset</button>
                  <button onClick={() => setOpen(false)} aria-label="Close">✕</button>
                </div>
                <TransformComponent
                  wrapperStyle={{ width: '100%', height: '100%' }}
                  contentStyle={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pick(isLight, animated)} alt={alt} className="dv-img" />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      )}
    </>
  );
}
