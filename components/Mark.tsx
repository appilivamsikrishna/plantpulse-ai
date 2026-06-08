/** The PlantPulse diamond, rendered as a crisp inline SVG that scales with the
 *  surrounding font-size (1em) and centers cleanly in both flex and inline
 *  contexts. Uses the `mark` class so existing color rules (green) apply. */
export default function Mark() {
  return (
    <svg
      className="mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ width: '1em', height: '1em', verticalAlign: '-0.125em', alignSelf: 'center', flex: '0 0 auto' }}
    >
      <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="currentColor" />
    </svg>
  );
}
