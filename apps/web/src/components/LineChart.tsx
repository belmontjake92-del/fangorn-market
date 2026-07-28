export interface Series {
  label: string;
  values: number[];
  color: string;
}

/** Minimal multi-series line chart. Each series is normalized to its own range. */
export function LineChart({ series, height = 200 }: { series: Series[]; height?: number }) {
  const W = 640;
  const H = height;
  const pad = 10;

  const paths = series.map((s) => {
    const min = Math.min(...s.values);
    const max = Math.max(...s.values);
    const range = max - min || 1;
    const n = s.values.length;
    const pts = s.values
      .map((v, i) => {
        const x = pad + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * pad));
        const y = pad + (1 - (v - min) / range) * (H - 2 * pad);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { color: s.color, pts };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#232326" strokeWidth={1} />
      {paths.map((p, i) => (
        <polyline key={i} points={p.pts} fill="none" stroke={p.color} strokeWidth={1.5} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
