/**
 * 📈 Graphiques SVG maison — zéro dépendance (le bundle admin reste à ~6 Ko
 * gzip). Composants purs : données en entrée, SVG responsive en sortie.
 * Accessibles (rôle img + aria-label), lisibles sur mobile.
 */
import type { JSX } from "react";

const fmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export const euros = (cents: number) => fmt.format(cents / 100);

const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso.slice(5) : shortDay.format(d);
};

/* -------------------------------------------------------------------------- */
/*  Courbe d'aire — CA par jour                                               */
/* -------------------------------------------------------------------------- */

export type AreaPoint = { label: string; value: number };

export function AreaChart({
  points,
  height = 180,
  color = "#c93227",
  formatValue = euros,
  ariaLabel,
}: {
  points: AreaPoint[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  ariaLabel: string;
}) {
  if (points.length < 2) {
    return <p className="py-8 text-center text-sm text-ink/40">Pas assez de données.</p>;
  }
  const W = 600;
  const H = height;
  const PAD = { t: 12, r: 8, b: 22, l: 8 };
  const max = Math.max(...points.map((p) => p.value), 1);
  const stepX = (W - PAD.l - PAD.r) / (points.length - 1);
  const xy = points.map((p, i) => ({
    x: PAD.l + i * stepX,
    y: PAD.t + (1 - p.value / max) * (H - PAD.t - PAD.b),
    p,
  }));
  const line = xy.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1].x.toFixed(1)},${H - PAD.b} L${PAD.l},${H - PAD.b} Z`;

  // Repères horizontaux (3 lignes) avec valeurs.
  const gridVals = [max, max / 2, 0];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      {gridVals.map((v, i) => {
        const y = PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
        return (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />
            <text x={PAD.l + 2} y={y - 3} fontSize="9" fill="currentColor" fillOpacity="0.4">
              {formatValue(v)}
            </text>
          </g>
        );
      })}
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${color.replace("#", "")})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.length <= 14 &&
        xy.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="3" fill="#fff" stroke={color} strokeWidth="2" />
            <title>{`${c.p.label} — ${formatValue(c.p.value)}`}</title>
          </g>
        ))}
      {points.map((p, i) =>
        i % Math.ceil(points.length / 7) === 0 || i === points.length - 1 ? (
          <text
            key={i}
            x={xy[i].x}
            y={H - 6}
            fontSize="9"
            textAnchor="middle"
            fill="currentColor"
            fillOpacity="0.45"
          >
            {dayLabel(p.label)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Barres — affluence par heure, comparatifs                                 */
/* -------------------------------------------------------------------------- */

export function BarChart({
  points,
  height = 150,
  color = "#7a8450",
  formatValue,
  ariaLabel,
}: {
  points: AreaPoint[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  ariaLabel: string;
}) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-ink/40">Pas de données.</p>;
  }
  const W = 600;
  const H = height;
  const PAD = { t: 10, r: 6, b: 18, l: 6 };
  const max = Math.max(...points.map((p) => p.value), 1);
  const slot = (W - PAD.l - PAD.r) / points.length;
  const barW = Math.max(slot * 0.62, 3);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
      {points.map((p, i) => {
        const h = (p.value / max) * (H - PAD.t - PAD.b);
        const x = PAD.l + i * slot + (slot - barW) / 2;
        const y = H - PAD.b - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(h, p.value > 0 ? 2 : 0)} rx="3" fill={p.value > 0 ? color : "currentColor"} fillOpacity={p.value > 0 ? 0.85 : 0.08}>
              <title>{`${p.label} — ${formatValue ? formatValue(p.value) : p.value}`}</title>
            </rect>
            {(points.length <= 12 || i % Math.ceil(points.length / 12) === 0) && (
              <text x={x + barW / 2} y={H - 4} fontSize="9" textAnchor="middle" fill="currentColor" fillOpacity="0.45">
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Donut — répartition (statuts…)                                            */
/* -------------------------------------------------------------------------- */

const DONUT_COLORS = ["#c93227", "#7a8450", "#e0a10b", "#4a6fa5", "#8a5b0a", "#9c9c9c"];

export function DonutChart({
  items,
  size = 150,
  ariaLabel,
}: {
  items: { label: string; value: number }[];
  size?: number;
  ariaLabel: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-ink/40">Pas de données.</p>;
  }
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={ariaLabel}>
        {items.map((item, i) => {
          const frac = item.value / total;
          const dash = frac * C;
          const el = (
            <circle
              key={i}
              cx="80" cy="80" r={R}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="26"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            >
              <title>{`${item.label} — ${item.value}`}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="24" fontWeight="800" fill="currentColor">
          {total}
        </text>
        <text x="80" y="96" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.5">
          total
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            <span className="font-semibold">{item.label}</span>
            <span className="text-ink/50">
              {item.value} ({Math.round((item.value / total) * 100)} %)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sparkline — mini-courbe dans les KPI cards                                */
/* -------------------------------------------------------------------------- */

export function Sparkline({
  values,
  color = "#c93227",
}: {
  values: number[];
  color?: string;
}): JSX.Element {
  if (values.length < 2) return <svg aria-hidden="true" className="h-6 w-24" />;
  const W = 96;
  const H = 24;
  const max = Math.max(...values, 1);
  const stepX = W / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(H - 3 - (v / max) * (H - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-24" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Variation en % entre deux périodes, pour les badges de tendance. */
export function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return current > 0 ? (
      <span className="rounded-full bg-olive/15 px-2 py-0.5 text-xs font-extrabold text-olive">nouveau</span>
    ) : null;
  }
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) {
    return <span className="rounded-full bg-ink/8 px-2 py-0.5 text-xs font-extrabold text-ink/50">stable</span>;
  }
  const up = delta > 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
        up ? "bg-olive/15 text-olive" : "bg-tomato/10 text-tomato-deep"
      }`}
    >
      {up ? "↗" : "↘"} {Math.abs(delta)} %
    </span>
  );
}
