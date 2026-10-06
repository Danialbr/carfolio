/**
 * DASHBOARD — the business at a glance.
 *
 * Ordered by what actually drives a decision:
 *   1. What can I spend?        (available funds — the next-car question)
 *   2. Where is my money?       (capital: protected / deployed / retained)
 *   3. How is it going?         (performance)
 *   4. What needs attention?    (Fernando's balance, aging cars, backups)
 *
 * Protected capital is given its own bordered panel, separated from profit,
 * because the specification's central rule is that principal and profit must
 * never be visually blurred.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space } from '../../theme';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  PressableCard,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Txt,
} from '../../components/ui/primitives';
import { DataRow, Money, Percent, Stat } from '../../components/ui/money';
import { useApp, selectGarage } from '../../state/store';
import { filterByType, summarize } from '../../domain/analytics';
import { formatMoney, formatMoneyCompact, formatPercent } from '../../domain/money';
import { formatDayCount } from '../../domain/dates';
import { vehicleTitle } from '../../domain/vehicle';
import type { TypeFilter } from '../../domain/analytics';

const FILTERS: readonly { value: TypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'MYSELF', label: 'Myself' },
  { value: 'ASSOCIATED', label: 'Associated' },
];

export default function Dashboard() {
  const router = useRouter();
  const rows = useApp((s) => s.vehicles);
  const position = useApp((s) => s.position);
  const fernando = useApp((s) => s.fernando);
  const integrity = useApp((s) => s.integrity);
  const garage = useApp(selectGarage);
  const backup = useApp((s) => s.backup);

  const [filter, setFilter] = useState<TypeFilter>('ALL');
  const summary = useMemo(() => summarize(filterByType(rows, filter)), [rows, filter]);

  const oldest = garage[0];
  const hasData = rows.length > 0;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginBottom: Space.lg }}>
        <View>
          <Txt variant="display">Carfolio</Txt>
          <Txt variant="small" tone="faint" style={{ marginTop: 4 }}>
            {hasData
              ? `${summary.totalVehicles} ${summary.totalVehicles === 1 ? 'vehicle' : 'vehicles'} · ${summary.vehiclesInGarage} in the garage`
              : 'Vehicle investment portfolio'}
          </Txt>
        </View>
      </Row>

      {/* A discrepancy here means a dollar has gone missing somewhere in the
          books. Silence would be far worse than an alarming banner. */}
      {!integrity.ok ? (
        <PressableCard
          onPress={() => router.push('/settings/integrity')}
          style={{ borderColor: Colors.loss, marginBottom: Space.lg }}
        >
          <Row gap={Space.md}>
            <Ionicons name="warning" size={20} color={Colors.loss} />
            <View style={{ flex: 1 }}>
              <Txt variant="small" weight="bold" style={{ color: Colors.loss }}>
                The books don&apos;t balance
              </Txt>
              <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                Off by {formatMoney(integrity.discrepancyCents, { cents: true })}. Tap for details.
              </Txt>
            </View>
          </Row>
        </PressableCard>
      ) : null}

      {/* With no cloud copy behind this app, work that has never been exported
          exists in exactly one place. This is the only prompt in the app that
          appears unasked, and it appears only when there is something real to
          lose — see domain/backupStatus.ts for the rule. */}
      {backup.urgency !== 'NONE' ? (
        <PressableCard
          onPress={() => router.push('/settings/backup')}
          style={{
            // No bottom margin: the gap below belongs to the section header
            // that follows, which owns spacing for the whole app.
            borderColor: backup.urgency === 'OVERDUE' ? Colors.warnSoft : Colors.border,
          }}
        >
          <Row gap={Space.md}>
            <Ionicons
              name="cloud-offline-outline"
              size={18}
              color={backup.urgency === 'OVERDUE' ? Colors.warn : Colors.text2}
            />
            <View style={{ flex: 1 }}>
              <Txt variant="label" style={{ color: backup.urgency === 'OVERDUE' ? Colors.warn : Colors.text1 }}>
                Back up your data
              </Txt>
              <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                {backup.message}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.text3} />
          </Row>
        </PressableCard>
      ) : null}

      {!hasData ? (
        <EmptyState
          icon="car-sport-outline"
          title="No vehicles yet"
          body="Add the first car you bought and Carfolio will track every dollar in and out of it."
          actionLabel="Add a vehicle"
          onAction={() => router.push('/vehicle/new')}
        />
      ) : null}

      {/* ── Capital ───────────────────────────────────────────────────── */}
      <SectionHeader title="Capital" action="Manage" onAction={() => router.push('/capital')} />

      <Card style={{ marginBottom: Space.md }}>
        <Txt variant="micro" tone="faint">
          AVAILABLE TO INVEST
        </Txt>
        <Money
          cents={position.cashOnHandCents}
          variant="display"
          weight="extrabold"
          style={{ marginTop: 4 }}
        />
        <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
          Cash on hand after everything currently tied up in vehicles
        </Txt>

        <Divider spacing={Space.md} />

        {/* Principal sits in its own panel. It is not profit and must never
            look like profit — that is the rule the whole capital model exists
            to protect. */}
        <View style={protectedPanel}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={6}>
              <Ionicons name="lock-closed" size={13} color={Colors.brand} />
              <Txt variant="micro" weight="bold" style={{ color: Colors.brand }}>
                PROTECTED CAPITAL
              </Txt>
            </Row>
            <Money cents={position.protectedCapitalCents} variant="body" weight="extrabold" />
          </Row>
          <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
            Your principal. Untouched by profit, distributions or reinvestment.
          </Txt>
        </View>

        <DataRow
          label="Deployed in vehicles"
          valueNode={<Money cents={position.capitalDeployedCents} variant="small" />}
        />
        <DataRow
          label="Retained in the business"
          valueNode={<Money cents={position.retainedEarningsCents} variant="small" signed />}
          hint="Profit kept in rather than taken out"
        />
        <DataRow
          label="Distributed to you"
          valueNode={<Money cents={position.totalDistributionsCents} variant="small" />}
        />
      </Card>

      {/* ── Fernando ──────────────────────────────────────────────────── */}
      {fernando.balanceCents !== 0 || fernando.profitSharesCents !== 0 ? (
        <PressableCard onPress={() => router.push('/fernando')} style={{ marginBottom: Space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="micro" tone="faint">
                {fernando.balanceCents >= 0 ? 'YOU OWE FERNANDO' : 'FERNANDO CARRIES A LOSS'}
              </Txt>
              <Money
                cents={Math.abs(fernando.balanceCents)}
                variant="heading"
                weight="extrabold"
                style={{ marginTop: 4 }}
              />
              <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                {fernando.balanceCents >= 0
                  ? 'Profit share plus expenses he paid, less what you have settled'
                  : 'Carried forward against his future profit share'}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text2} />
          </Row>
        </PressableCard>
      ) : null}

      {/* ── Performance ───────────────────────────────────────────────── */}
      <SectionHeader
        title="Performance"
        action="Analytics"
        onAction={() => router.push('/analytics')}
        style={{ marginTop: Space.lg }}
      />
      <Segmented options={FILTERS} value={filter} onChange={setFilter} style={{ marginBottom: Space.md }} />

      <Row gap={Space.sm} style={{ marginBottom: Space.sm }}>
        <Stat
          label="Gross profit"
          // Signed, because the sign is the information — and because colour
          // alone must never be what tells you the year went well.
          value={formatMoneyCompact(summary.totalGrossProfitCents, { signed: true })}
          tone={summary.totalGrossProfitCents >= 0 ? 'profit' : 'loss'}
          sub={`${summary.vehiclesSold} sold`}
        />
        <Stat
          label="Avg profit"
          value={
            summary.averageGrossProfitCents == null
              ? '—'
              : formatMoneyCompact(summary.averageGrossProfitCents)
          }
          sub="per vehicle"
        />
      </Row>
      <Row gap={Space.sm} style={{ marginBottom: Space.sm }}>
        <Stat
          label="Avg ROI"
          value={
            formatPercent(summary.averageRoi)
          }
          tone={(summary.averageRoi ?? 0) >= 0 ? 'profit' : 'loss'}
          sub="per vehicle"
        />
        <Stat
          label="Avg days"
          value={
            summary.averageDaysToSell == null ? '—' : String(Math.round(summary.averageDaysToSell))
          }
          sub="to sell"
        />
      </Row>
      <Row gap={Space.sm}>
        <Stat label="Total invested" value={formatMoneyCompact(summary.totalInvestedCents)} />
        <Stat label="Total sales" value={formatMoneyCompact(summary.totalSalesCents)} />
      </Row>

      {/* ── Aging ─────────────────────────────────────────────────────── */}
      {oldest && (oldest.financials.daysHeld ?? 0) > 45 ? (
        <>
          <SectionHeader title="Needs attention" style={{ marginTop: Space.xl }} />
          <PressableCard onPress={() => router.push(`/vehicle/${oldest.vehicle.id}`)}>
            <Row gap={Space.md}>
              <Ionicons name="hourglass-outline" size={20} color={Colors.warn} />
              <View style={{ flex: 1 }}>
                <Txt variant="small" weight="bold">
                  {vehicleTitle(oldest.vehicle)}
                </Txt>
                <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                  Held {formatDayCount(oldest.financials.daysHeld)} — your oldest unsold vehicle,
                  with {formatMoney(oldest.financials.totalInvestedCents)} tied up in it.
                </Txt>
              </View>
            </Row>
          </PressableCard>
        </>
      ) : null}

      {/* ── Best and worst ────────────────────────────────────────────── */}
      {summary.bestProfit && summary.worstProfit ? (
        <>
          <SectionHeader title="Extremes" style={{ marginTop: Space.xl }} />
          <Card>
            <DataRow
              label={summary.bestProfit.label || 'Best deal'}
              valueNode={<Money cents={summary.bestProfit.valueCents} variant="small" signed />}
              hint="Best profit"
            />
            <Divider spacing={Space.sm} />
            <DataRow
              label={summary.worstProfit.label || 'Worst deal'}
              valueNode={<Money cents={summary.worstProfit.valueCents} variant="small" signed />}
              hint="Worst result"
            />
            {summary.bestRoi ? (
              <>
                <Divider spacing={Space.sm} />
                <DataRow
                  label={summary.bestRoi.label || 'Best return'}
                  valueNode={<Percent ratio={summary.bestRoi.ratio} variant="small" />}
                  hint="Best ROI"
                />
              </>
            ) : null}
          </Card>
        </>
      ) : null}

      {hasData ? (
        <Row gap={Space.sm} style={{ marginTop: Space.xl }}>
          <Button
            label="Year to date"
            variant="secondary"
            icon="calendar-outline"
            onPress={() => router.push('/ytd')}
          />
        </Row>
      ) : null}
    </Screen>
  );
}

const protectedPanel = {
  backgroundColor: Colors.brandSoft,
  borderWidth: 1,
  borderColor: Colors.brandBorder,
  borderRadius: Radius.md,
  padding: Space.md,
  marginBottom: Space.sm,
};
