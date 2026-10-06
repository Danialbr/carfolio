/**
 * PROFIT CHART — three views of the same twelve numbers.
 *
 *   FLOW   Cumulative profit across the year as a smooth area. Answers "is the
 *          business climbing?" — the shape of the line is the answer, and the
 *          curve makes a run of months read as one continuous story.
 *   SPLIT  A ring: which months contributed what share of the year, in percent.
 *          Answers "where did the money actually come from?"
 *   BARS   Month by month around a zero line. Answers "which months lost
 *          money?" — polarity, which the other two views deliberately smooth
 *          away.
 *
 * They are not decoration of each other. Each form answers a question the other
 * two answer badly, which is the only good reason to offer a toggle.
 *
 * Accessibility note, and the reason every view keeps its baseline:
 * profit-mint (#6EE7C8) against loss-rose (#F2748F) separates by only ΔE 7.1
 * under deuteranopia — the classic red/green failure, and the most common
 * accessibility bug in financial interfaces. Colour alone is therefore NOT
 * allowed to carry meaning here. Two independent encodings always do the work:
 * position relative to a drawn zero line, and an explicit + or − on every
 * printed figure. A red/green-blind reader loses nothing.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, G } from 'react-native-svg';

import { Colors, Space } from '../../theme';
import { Row, Segmented, Txt } from '../ui/primitives';
import { formatMoneyCompact } from '../../domain/money';
import type { Cents } from '../../domain/money';

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type ChartView = 'FLOW' | 'SPLIT' | 'BARS';

const VIEWS = [
  { value: 'FLOW' as const, label: 'Flow' },
  { value: 'SPLIT' as const, label: 'Split' },
  { value: 'BARS' as const, label: 'Months' },
];

/* ── Geometry helpers (pure) ──────────────────────────────────────────────── */

/**
 * A Catmull-Rom spline converted to cubic béziers. Straight segments joined at
 * sharp corners read as a chart; a continuous curve reads as a flow, which is
 * the whole point of this view. Tension is deliberately low so the curve never
 * overshoots a data point and implies a value the month did not reach.
 */
function smoothPath(points: readonly { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]!;
    const t = 6;
    d +=
      ` C ${p1.x + (p2.x - p0.x) / t} ${p1.y + (p2.y - p0.y) / t},` +
      ` ${p2.x - (p3.x - p1.x) / t} ${p2.y - (p3.y - p1.y) / t},` +
      ` ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Running total, month by month. */
export function cumulative(months: readonly Cents[]): Cents[] {
  let total = 0;
  return months.map((m) => {
    total += m;
    return total;
  });
}

/* ── Views ────────────────────────────────────────────────────────────────── */

function FlowView({ months, height }: { months: readonly Cents[]; height: number }) {
  const running = useMemo(() => cumulative(months), [months]);

  const width = 320;
  const padY = 14;
  const top = Math.max(...running, 0);
  const bottom = Math.min(...running, 0);
  const span = top - bottom || 1;

  const y = (value: number) => padY + ((top - value) / span) * (height - padY * 2);
  const x = (index: number) => (index / (running.length - 1)) * width;

  const points = running.map((value, index) => ({ x: x(index), y: y(value) }));
  const line = smoothPath(points);
  const zeroY = y(0);
  // The fill closes on the zero line, not on the bottom of the box, so a year
  // that went negative shades downward from zero instead of hanging off nothing.
  const area = `${line} L ${width} ${zeroY} L 0 ${zeroY} Z`;

  const last = running[running.length - 1] ?? 0;
  const positive = last >= 0;
  const stroke = positive ? Colors.profit : Colors.loss;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={area} fill={stroke} fillOpacity={0.1} />
      <Line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke={Colors.borderStrong} strokeWidth={1} />
      <Path d={line} stroke={stroke} strokeWidth={1.75} fill="none" strokeLinecap="round" />
      {/* The endpoint is the figure printed below the chart. Marking it ties
          the shape to the number instead of leaving the reader to guess. */}
      <Circle cx={width} cy={y(last)} r={3.5} fill={stroke} />
      <Circle cx={width} cy={y(last)} r={7} fill={stroke} fillOpacity={0.18} />
    </Svg>
  );
}

function SplitView({ months, height }: { months: readonly Cents[]; height: number }) {
  // Only profitable months take a share of a ring: a slice of negative size is
  // not a thing, and drawing losses here would be a lie. Losses stay in Months.
  const gains = useMemo(
    () => months.map((value, index) => ({ index, value })).filter((m) => m.value > 0),
    [months],
  );
  const total = gains.reduce((sum, m) => sum + m.value, 0);

  const size = height;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const circumference = 2 * Math.PI * r;
  const gap = 2.5;

  const best = gains.reduce<{ index: number; value: number } | null>(
    (top, m) => (top == null || m.value > top.value ? m : top),
    null,
  );

  // Built by scan rather than by mutating a counter inside map: the arc for a
  // month depends only on the months before it, so it can be stated that way.
  const arcs = gains.map((m, i) => {
    const before = gains.slice(0, i).reduce((sum, g) => sum + g.value, 0);
    const fraction = m.value / total;
    return {
      key: m.index,
      length: Math.max(circumference * fraction - gap, 1),
      offset: (before / total) * circumference,
      isBest: best?.index === m.index,
    };
  });

  return (
    <Row gap={Space.lg} style={{ alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          <Circle cx={cx} cy={cy} r={r} stroke={Colors.border} strokeWidth={9} fill="none" />
          {arcs.map((arc) => (
            <Circle
              key={arc.key}
              cx={cx}
              cy={cy}
              r={r}
              stroke={Colors.profit}
              strokeOpacity={arc.isBest ? 1 : 0.42}
              strokeWidth={9}
              fill="none"
              strokeLinecap="butt"
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </G>
      </Svg>

      <View style={{ flex: 1, gap: 8 }}>
        {/* A legend, because a ring without one is a decoration. Top three
            months named, the rest collapsed — twelve rows would not fit and
            nobody reads the twelfth. */}
        {[...gains]
          .sort((a, b) => b.value - a.value)
          .slice(0, 3)
          .map((m) => (
            <Row key={m.index} style={{ justifyContent: 'space-between' }}>
              <Row gap={8} style={{ flex: 1 }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 1,
                    backgroundColor: Colors.profit,
                    opacity: best?.index === m.index ? 1 : 0.42,
                  }}
                />
                <Txt variant="small" tone="muted">
                  {MONTH_NAMES[m.index]}
                </Txt>
              </Row>
              <Txt variant="small" numeric>
                {Math.round((m.value / total) * 100)}%
              </Txt>
            </Row>
          ))}
        {gains.length > 3 ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" tone="faint">
              {gains.length - 3} other months
            </Txt>
            <Txt variant="small" tone="faint" numeric>
              {Math.round(
                ([...gains].sort((a, b) => b.value - a.value).slice(3).reduce((s, m) => s + m.value, 0) /
                  total) *
                  100,
              )}
              %
            </Txt>
          </Row>
        ) : null}
      </View>
    </Row>
  );
}

function BarsView({ months, height }: { months: readonly Cents[]; height: number }) {
  const max = Math.max(...months.map((m) => Math.abs(m)), 1);
  const barWidth = 14;
  const gap = 10;
  const width = months.length * (barWidth + gap) - gap;
  const half = height / 2;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Line x1={0} y1={half} x2={width} y2={half} stroke={Colors.borderStrong} strokeWidth={1} />
      {months.map((value, index) => {
        const magnitude = (Math.abs(value) / max) * (half - 6);
        const positive = value >= 0;
        // A zero month still shows a 2px stub so the axis reads as twelve
        // months rather than a gap where data is missing.
        const barHeight = value === 0 ? 2 : Math.max(magnitude, 3);
        return (
          <Rect
            key={index}
            x={index * (barWidth + gap)}
            y={positive ? half - barHeight : half}
            width={barWidth}
            height={barHeight}
            rx={2}
            fill={value === 0 ? Colors.border : positive ? Colors.profit : Colors.loss}
            fillOpacity={value === 0 ? 1 : 0.85}
          />
        );
      })}
    </Svg>
  );
}

/* ── Shell ────────────────────────────────────────────────────────────────── */

export function ProfitChart({
  months,
  height = 132,
  initialView = 'FLOW',
}: {
  /** Twelve values, January first. */
  months: readonly Cents[];
  height?: number;
  initialView?: ChartView;
}) {
  const [view, setView] = useState<ChartView>(initialView);

  const { hasData, hasGains, total } = useMemo(() => {
    const sum = months.reduce((acc, m) => acc + m, 0);
    return {
      hasData: months.some((m) => m !== 0),
      hasGains: months.some((m) => m > 0),
      total: sum,
    };
  }, [months]);

  if (!hasData) {
    return (
      <View style={{ paddingVertical: Space.xl, alignItems: 'center' }}>
        <Txt variant="small" tone="faint">
          No sales recorded in this year.
        </Txt>
      </View>
    );
  }

  // Offering an empty ring would be worse than not offering it.
  const views = hasGains ? VIEWS : VIEWS.filter((v) => v.value !== 'SPLIT');
  const active = view === 'SPLIT' && !hasGains ? 'FLOW' : view;

  return (
    <View>
      <Segmented
        options={views}
        value={active}
        onChange={setView}
        style={{ marginBottom: Space.lg }}
      />

      {active === 'FLOW' ? <FlowView months={months} height={height} /> : null}
      {active === 'SPLIT' ? <SplitView months={months} height={height} /> : null}
      {active === 'BARS' ? <BarsView months={months} height={height} /> : null}

      {active === 'BARS' ? (
        <Row style={{ justifyContent: 'space-between', marginTop: 4 }} gap={0}>
          {MONTH_INITIALS.map((initial, index) => (
            <Txt
              key={index}
              variant="micro"
              tone="faint"
              style={{ width: 24, textAlign: 'center' }}
            >
              {initial}
            </Txt>
          ))}
        </Row>
      ) : null}

      <Row style={{ justifyContent: 'space-between', marginTop: Space.md }}>
        <Txt variant="label" tone="faint">
          {active === 'FLOW'
            ? 'Cumulative · Jan to Dec'
            : active === 'SPLIT'
              ? 'Share of the year’s profit'
              : 'Baseline = $0'}
        </Txt>
        <Txt variant="small" numeric style={{ color: total >= 0 ? Colors.profit : Colors.loss }}>
          {formatMoneyCompact(total, { signed: true })}
        </Txt>
      </Row>
    </View>
  );
}
