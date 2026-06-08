/** Animated indicator shown while an answer is being generated / streamed:
 *  a shimmering, breathing diamond with two shiny sparks on tilted elliptical
 *  orbits, a soft rotating wedge behind it, and an EKG vitals trace beside it.
 *  All motion is CSS (see .ld-think in globals.css) and respects reduced-motion. */
export default function ThinkingIcon() {
  return (
    <span className="ld-think" aria-hidden="true">
      <span className="orb">
        <span className="dmd">◆</span>
        <span className="el el1">
          <i />
        </span>
        <span className="el el2">
          <i />
        </span>
      </span>
      <svg viewBox="0 0 62 26">
        <path d="M0 13 H16 l2 -9 l3 18 l3 -16 l2 7 H62" />
      </svg>
    </span>
  );
}
