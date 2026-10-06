/**
 * ANALYTICS — how efficiently the business is flipping cars.
 *
 * The averages are computed over SOLD vehicles only. Including cars still in
 * the garage would drag every figure toward nothing, because an unsold car has
 * costs and no revenue yet.
 *
 * Two ROI figures are shown, labelled differently, because they answer
 * different questions and reporting only one of them is how these screens
 * mislead people. See the note beside them.
 */

import React, { useMemo, useState } from 'react';

import { Colors, Space } from '../theme';
import {
  Card,
  Divider,
  EmptyState,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Txt,
} from '../components/ui/primitives';
import { DataRow, Money, Percent, Stat } from '../components/ui/money';
import { ScreenHeader } from '../components/domain/ScreenHeader';
import { ProfitChart } from '../components/domain/ProfitChart';
import { useApp } from '../state/store';
import {
  activeYears,
  filterByType,
  monthlyProfit,
  summarize,
  type TypeFilter,
} from '../domain/analytics';
import { formatMoneyCompact, formatPercent } from '../domain/money';
import { formatDayCount } from '../domain/dates';

const FILTERS: readonly { value: TypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'MYSELF', label: 'Myself' },
  { value: 'ASSOCIATED', label: 'Associated' },
];

export default function Analytics() {
  const rows = useApp((s) => s.vehicles);
  const [filter, setFilter] = useState<TypeFilter>('ALL');

  const filtered = useMemo(() => filterByType(rows, filter), [rows, filter]);
  const all = useMemo(() => summarize(filtered), [filtered]);
  const myself = useMemo(() => summarize(filterByType(rows, 'MYSELF')), [rows]);
  const associated = useMemo(() => summarize(filterByType(rows, 'ASSOCIATED')), [rows]);

  const years = useMemo(() => activeYears(rows), [rows]);
  const chartYear = years[0] ?? new Date().getFullYear();
  const months = useMemo(() => monthlyProfit(filtered, chartYear), [filtered, chartYear]);

  if (all.vehiclesSold === 0 && rows.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Analytics" />
        <EmptyState
          icon="stats-chart-outline"
          title="Nothing to measure yet"
          body="Once you've sold a vehicle, this is where you'll see how the business is actually performing."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Analytics"
        subtitle={`${all.vehiclesSold} sold · ${all.vehiclesInGarage} in the garage`}
      />

      <Segmented
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        style={{ marginBottom: Space.lg }}
      />

      {/* ── Headline ─────────────────────────────────────────────────── */}
      <Row gap={Space.sm} style={{ marginBottom: Space.sm }}>
        <Stat
          label="Avg profit"
          value={
            all.averageGrossProfitCents == null
              ? '—'
              : formatMoneyCompact(all.averageGrossProfitCents)
          }
          tone={(all.averageGrossProfitCents ?? 0) >= 0 ? 'profit' : 'loss'}
          sub="per vehicle sold"
        />
        <Stat
          label="Avg days to sell"
          value={
            all.averageDaysToSell == null ? '—' : String(Math.round(all.averageDaysToSell))
          }
          sub="purchase to sale"
        />
      </Row>
      <Row gap={Space.sm} style={{ marginBottom: Space.lg }}>
        <Stat
          label="Avg investment"
          value={
            all.averageTotalInvestmentCents == null
              ? '—'
              : formatMoneyCompact(all.averageTotalInvestmentCents)
          }
          sub="all-in per car"
        />
        <Stat
          label="Avg ROI"
          value={formatPercent(all.averageRoi)}
          tone={(all.averageRoi ?? 0) >= 0 ? 'profit' : 'loss'}
          sub="per vehicle"
        />
      </Row>

      {/* ── Chart ────────────────────────────────────────────────────── */}
      <SectionHeader title={`Realized profit by month · ${chartYear}`} />
      <Card style={{ marginBottom: Space.lg }}>
        <ProfitChart months={months} />
      </Card>

      {/* ── The two ROIs ─────────────────────────────────────────────── */}
      <SectionHeader title="Return" />
      <Card style={{ marginBottom: Space.lg }}>
        <DataRow
          label="Average ROI per vehicle"
          valueNode={<Percent ratio={all.averageRoi} variant="body" />}
          hint="The mean of each car's own return"
        />
        <DataRow
          label="Return on money invested"
          valueNode={<Percent ratio={all.aggregateRoi} variant="body" />}
          hint="Total profit ÷ total invested"
        />
        <Divider spacing={Space.sm} />
        <Txt variant="micro" tone="faint">
          These differ when your deals are different sizes. A $200 profit on a $400 car and a
          $1,000 profit on a $20,000 car average 27.5% per car but returned 5.9% on the money.
          Both are true; the second is the one that pays you.
        </Txt>
      </Card>

      {/* ── Averages in detail ───────────────────────────────────────── */}
      <SectionHeader title="Averages per sold vehicle" />
      <Card style={{ marginBottom: Space.lg }}>
        <DataRow
          label="Purchase price"
          valueNode={<Money cents={all.averagePurchasePriceCents} variant="small" />}
        />
        <DataRow
          label="Additional investment"
          valueNode={<Money cents={all.averageAdditionalInvestmentCents} variant="small" />}
        />
        <DataRow
          label="Total investment"
          valueNode={<Money cents={all.averageTotalInvestmentCents} variant="small" />}
          emphasis
        />
        <Divider spacing={Space.sm} />
        <DataRow
          label="Sale price"
          valueNode={<Money cents={all.averageSalePriceCents} variant="small" />}
        />
        <DataRow
          label="Gross profit"
          valueNode={<Money cents={all.averageGrossProfitCents} variant="small" signed />}
          emphasis
        />
        <DataRow
          label="Days to sell"
          value={all.averageDaysToSell == null ? '—' : formatDayCount(all.averageDaysToSell)}
        />
      </Card>

      {/* ── Totals ───────────────────────────────────────────────────── */}
      <SectionHeader title="Totals" />
      <Card style={{ marginBottom: Space.lg }}>
        <DataRow label="Vehicles sold" value={String(all.vehiclesSold)} />
        <DataRow label="Still in the garage" value={String(all.vehiclesInGarage)} />
        <DataRow
          label="Total invested"
          valueNode={<Money cents={all.totalInvestedCents} variant="small" />}
        />
        <DataRow
          label="Total sales"
          valueNode={<Money cents={all.totalSalesCents} variant="small" />}
        />
        <DataRow
          label="Gross profit"
          valueNode={<Money cents={all.totalGrossProfitCents} variant="body" signed />}
          emphasis
        />
      </Card>

      {/* ── Best and worst ───────────────────────────────────────────── */}
      {all.bestProfit || all.worstProfit ? (
        <>
          <SectionHeader title="Best and worst" />
          <Card style={{ marginBottom: Space.lg }}>
            {all.bestProfit ? (
              <DataRow
                label={all.bestProfit.label || 'Best profit'}
                valueNode={<Money cents={all.bestProfit.valueCents} variant="small" signed />}
                hint="Best profit"
              />
            ) : null}
            {all.worstProfit ? (
              <DataRow
                label={all.worstProfit.label || 'Worst result'}
                valueNode={<Money cents={all.worstProfit.valueCents} variant="small" signed />}
                hint="Worst result"
              />
            ) : null}
            {all.bestRoi ? (
              <DataRow
                label={all.bestRoi.label || 'Best return'}
                valueNode={<Percent ratio={all.bestRoi.ratio} variant="small" />}
                hint="Best ROI"
              />
            ) : null}
            {all.worstRoi ? (
              <DataRow
                label={all.worstRoi.label || 'Worst return'}
                valueNode={<Percent ratio={all.worstRoi.ratio} variant="small" />}
                hint="Worst ROI"
              />
            ) : null}
          </Card>
        </>
      ) : null}

      {/* ── Myself vs Associated ─────────────────────────────────────── */}
      <SectionHeader title="Myself vs Associated" />
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: Space.sm }}>
          <Txt variant="micro" tone="faint" style={{ flex: 2 }}>
            {' '}
          </Txt>
          <Txt variant="micro" tone="faint" style={{ flex: 1, textAlign: 'right' }}>
            MYSELF
          </Txt>
          <Txt variant="micro" tone="faint" style={{ flex: 1, textAlign: 'right' }}>
            ASSOC.
          </Txt>
        </Row>

        <CompareRow
          label="Sold"
          left={String(myself.vehiclesSold)}
          right={String(associated.vehiclesSold)}
        />
        <CompareRow
          label="Gross profit"
          left={formatMoneyCompact(myself.totalGrossProfitCents)}
          right={formatMoneyCompact(associated.totalGrossProfitCents)}
        />
        <CompareRow
          label="Avg profit"
          left={
            myself.averageGrossProfitCents == null
              ? '—'
              : formatMoneyCompact(myself.averageGrossProfitCents)
          }
          right={
            associated.averageGrossProfitCents == null
              ? '—'
              : formatMoneyCompact(associated.averageGrossProfitCents)
          }
        />
        <CompareRow
          label="Avg ROI"
          left={formatPercent(myself.averageRoi)}
          right={
            formatPercent(associated.averageRoi)
          }
        />
        <CompareRow
          label="Avg days"
          left={
            myself.averageDaysToSell == null ? '—' : String(Math.round(myself.averageDaysToSell))
          }
          right={
            associated.averageDaysToSell == null
              ? '—'
              : String(Math.round(associated.averageDaysToSell))
          }
        />

        <Divider spacing={Space.sm} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="micro" tone="faint" style={{ flex: 1 }}>
            Your half of the associated profit
          </Txt>
          <Money cents={associated.danielProfitCents} variant="small" signed />
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <Txt variant="micro" tone="faint" style={{ flex: 1 }}>
            Fernando&apos;s half
          </Txt>
          <Money cents={associated.fernandoProfitCents} variant="small" signed />
        </Row>
      </Card>
    </Screen>
  );
}

function CompareRow({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <Txt variant="small" tone="faint" style={{ flex: 2 }}>
        {label}
      </Txt>
      <Txt
        variant="small"
        weight="semibold"
        numeric
        style={{ flex: 1, textAlign: 'right', color: Colors.text0 }}
      >
        {left}
      </Txt>
      <Txt
        variant="small"
        weight="semibold"
        numeric
        style={{ flex: 1, textAlign: 'right', color: Colors.text0 }}
      >
        {right}
      </Txt>
    </Row>
  );
}
