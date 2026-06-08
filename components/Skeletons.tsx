/** Shimmer placeholders shown while an answer is being generated.
 *  Colors come from --line-soft / --line so they follow the active theme. */

export const AnswerSkeleton = () => {
  const widths = ['92%', '100%', '70%', '46%'];
  return (
    <div className="skel-answer" aria-busy="true" aria-label="Generating answer">
      {widths.map((w, i) => (
        <div key={i} className="skel skel-line" style={{ width: w }} />
      ))}
    </div>
  );
};

export const SignalSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="signal" aria-busy="true" aria-label="Building the signal path">
    {Array.from({ length: rows }).map((_, i) => (
      <div className="skel-node" key={i}>
        <div className="skel skel-ico" />
        <div style={{ flex: 1 }}>
          <div className="skel skel-bar" style={{ width: '42%', height: 9, marginBottom: 9 }} />
          <div className="skel skel-bar" style={{ width: `${82 - i * 6}%`, height: 12 }} />
        </div>
      </div>
    ))}
  </div>
);
