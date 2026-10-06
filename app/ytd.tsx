/**
 * YEAR TO DATE — one year at a time, with the Myself / Associated split.
 *
 * A vehicle counts toward the year it SOLD in, because that is the year the
 * profit was realized. A car bought in December and sold in February belongs to
 * the second year's results and the first year's purchase count, and both are
 * shown so neither figure is quietly wrong.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Colors, Radius, Space } from '../theme';
import {
  Card,
  Divider,
  EmptyState,
  Row,
  Screen,
  SectionHeader,
  Txt,
} from '../components/ui/primitives';
import { DataRow, Money, Percent, Stat } from '../components/ui/money';
import { ScreenHeader } from '../components/domain/ScreenHeader';
import { ProfitChart } from '../components/domain/ProfitChart';
import { useApp } from '../state/store';
import { activeYears, monthlyProfit, summarizeYear } from '../domain/analytics';
import { formatMoneyCompact } from '../domain/money';
import { formatDayCount } from '../domain/dates';

export default function YearToDate() {
  const rows = useApp((s) => s.vehicles);
  const years = useMemo(() => activeYears(rows), [rows]);
  const [year, setYear] = useState<number>(years[0] ?? new Date().getFullYear());

  const summary = useMemo(() => summarizeYear(rows, year), [rows, year]);
  const months = useMemo(() => monthlyProfit(rows, year), [rows, year]);

  if (years.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Year to date" />
        <EmptyState
          icon="calendar-outline"
          title="No activity yet"
          body="Yearly totals appear once you've bought or sold a vehicle."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Year to date" subtitle="Select a year to see its full picture" />

      {/* A horizontal strip rather than a dropdown: with a handful of years it
          is one tap instead of two, and you can see the whole range. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: Space.sm, paddingBottom: Space.lg }}
      >
        {years.map((candidate) => {
          const active = candidate === year;
          return (
            <View
              key={candidate}
              onTouchEnd={() => setYear(candidate)}
              style={[yearChip, active && yearChipActive]}
            >
              <Txt
                variant="small"
                weight={active ? 'bold' : 'regular'}
                numeric
                style={{ color: active ? Colors.brand : Colors.text1 }}
              >
                {candidate}
              </Txt>
            </View>
          );
        })}
      </ScrollView>

      <SectionHeader title={`Business · ${year}`} />
      <Row gap={Space.sm} style={{ marginBottom: Space.sm }}>
        <Stat
          label="Gross profit"
          value={formatMoneyCompact(summary.grossProfitCents)}
          tone={summary.grossProfitCents >= 0 ? 'profit' : 'loss'}
        />
        <Stat label="Sold" value={String(summary.vehiclesSold)} sub="vehicles" />
      </Row>
      <Row gap={Space.sm} style={{ marginBottom: Space.lg }}>
        <Stat label="Purchased" value={String(summary.vehiclesPurchased)} sub="vehicles" />
        <Stat
          label="Avg days"
          value={
            summary.averageDaysToSell == null
              ? '—'
              : String(Math.round(summary.averageDaysToSell))
          }
          sub="to sell"
        />
      </Row>

      <Card style={{ marginBottom: Space.lg }}>
        <ProfitChart months={months} />
      </Card>

      <Card style={{ marginBottom: Space.lg }}>
        <DataRow
          label="Total invested"
          valueNode={<Money cents={summary.totalInvestedCents} variant="small" />}
          hint="Across vehicles sold this year"
        />
        <DataRow
          label="Total sales"
          valueNode={<Money cents={summary.totalSalesCents} variant="small" />}
        />
        <DataRow
          label="Gross profit"
          valueNode={<Money cents={summary.grossProfitCents} variant="body" signed />}
          emphasis
        />
        <Divider spacing={Space.sm} />
        <DataRow
          label="Average profit"
          valueNode={<Money cents={summary.averageProfitCents} variant="small" signed />}
        />
        <DataRow
          label="Average ROI"
          valueNode={<Percent ratio={summary.averageRoi} variant="small" />}
        />
        <DataRow
          label="Average days to sell"
          value={
            summary.averageDaysToSell == null ? '—' : formatDayCount(summary.averageDaysToSell)
          }
        />
      </Card>

      {/* ── Myself ───────────────────────────────────────────────────── */}
      <SectionHeader title="Myself" />
      <Card style={{ marginBottom: Space.lg }}>
        <DataRow label="Vehicles sold" value={String(summary.myself.vehiclesSold)} />
        <DataRow
          label="Investment"
          valueNode={<Money cents={summary.myself.totalInvestedCents} variant="small" />}
        />
        <DataRow
          label="Profit"
          valueNode={<Money cents={summary.myself.totalGrossProfitCents} variant="body" signed />}
          hint="100% yours"
          emphasis
        />
        <DataRow
          label="ROI"
          valueNode={<Percent ratio={summary.myself.aggregateRoi} variant="small" />}
        />
      </Card>

      {/* ── Associated ───────────────────────────────────────────────── */}
      <SectionHeader title="Associated" />
      <Card style={{ marginBottom: Space.lg }}>
        <DataRow label="Vehicles sold" value={String(summary.associated.vehiclesSold)} />
        <DataRow
          label="Investment"
          valueNode={<Money cents={summary.associated.totalInvestedCents} variant="small" />}
          hint="All funded by you"
        />
        <DataRow
          label="Total associated profit"
          valueNode={
            <Money cents={summary.associated.totalGrossProfitCents} variant="body" signed />
          }
          emphasis
        />
        <DataRow
          label="ROI"
          valueNode={<Percent ratio={summary.associated.aggregateRoi} variant="small" />}
        />

        <View style={splitPanel}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" weight="semibold">
              Your 50%
            </Txt>
            <Money cents={summary.associatedDanielCents} variant="body" signed />
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
            <Txt variant="small" weight="semibold">
              Fernando&apos;s 50%
            </Txt>
            <Money cents={summary.associatedFernandoCents} variant="body" signed />
          </Row>
        </View>
      </Card>

      {summary.vehiclesSold === 0 && summary.vehiclesPurchased === 0 ? (
        <Txt variant="small" tone="faint" center>
          Nothing was bought or sold in {year}.
        </Txt>
      ) : null}
    </Screen>
  );
}

const yearChip = {
  paddingHorizontal: Space.lg,
  paddingVertical: Space.sm,
  borderRadius: Radius.pill,
  backgroundColor: Colors.surface,
  borderWidth: 1,
  borderColor: Colors.border,
};

const yearChipActive = {
  backgroundColor: Colors.brandSoft,
  borderColor: Colors.brandBorder,
};

const splitPanel = {
  backgroundColor: Colors.cardElevated,
  borderRadius: Radius.md,
  padding: Space.md,
  marginTop: Space.md,
};
