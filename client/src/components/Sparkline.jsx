import { memo, useMemo } from 'react';
import { useInView } from '../hooks/useInView.js';

const W = 120, H = 34;

/** 7-day trend line. Only built/rendered once scrolled into view (cheap for long tables). */
function Sparkline({ values }) {
  const [ref, seen] = useInView();
  const path = useMemo(() => {
    if (!seen || !values || values.length < 2) return null;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    return values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`).join('');
  }, [seen, values]);
  const up = values && values.length > 1 && values[values.length - 1] >= values[0];
  return (
    <div ref={ref} className="spark" style={{ width: W, height: H }}>
      {path && <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="7 day price trend"><path d={path} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.6" strokeLinejoin="round" /></svg>}
    </div>
  );
}
export default memo(Sparkline);
