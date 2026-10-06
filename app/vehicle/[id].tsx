/**
 * VEHICLE DETAIL — the deal, top to bottom.
 *
 * The sections follow the specification's workflow in order, so the screen
 * reads as an argument rather than a form dump:
 *
 *   OVERVIEW → INVESTMENT BREAKDOWN → TOTAL INVESTED → SALE
 *            → GROSS PROFIT/LOSS → PROFIT ALLOCATION → EXPENSES → TIMELINE
 *
 * Purchase price and additional investment are always shown as two separate
 * lines that add to a third. The user never has to compute anything.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space } from '../../theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  PressableCard,
  Row,
  Screen,
  SectionHeader,
  Txt,
} from '../../components/ui/primitives';
import { DataRow, Money, Percent } from '../../components/ui/money';
import { OptionSheet } from '../../components/ui/Sheet';
import { ScreenHeader } from '../../components/domain/ScreenHeader';
import { StatusPill, TypePill } from '../../components/domain/VehicleCard';
import { ExpenseSheet } from '../../components/domain/ExpenseSheet';
import { confirm, notify } from '../../components/ui/dialog';
import { useApp, selectVehicle, withRefresh } from '../../state/store';
import { deleteExpense, reverseSale, setVehicleStatus } from '../../db/operations';
import * as reposModule from '../../db/repos';
import { categoryLabel } from '../../domain/categories';
import { formatDate, formatDayCount, formatShortDate } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import {
  STATUS_LABELS,
  formatMileage,
  nextStatuses,
  vehicleTitle,
} from '../../domain/vehicle';
import type { VehicleStatus } from '../../domain/types';

export default function VehicleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const row = useApp((s) => selectVehicle(s, id ?? ''));
  // Select the stable array, then narrow it here. A selector that filtered
  // would return a new array on every render and loop forever.
  const allExpenses = useApp((s) => s.snapshot.expenses);
  const expenses = useMemo(
    () =>
      allExpenses
        .filter((e) => e.vehicleId === id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [allExpenses, id],
  );

  const [statusSheet, setStatusSheet] = useState(false);
  const [expenseSheet, setExpenseSheet] = useState(false);

  const statusOptions = useMemo(
    () =>
      row
        ? nextStatuses(row.vehicle.status).map((value) => ({
            value,
            label: STATUS_LABELS[value],
          }))
        : [],
    [row],
  );

  /**
   * Deleting a vehicle re-renders this screen before navigation unwinds. Without
   * this guard the render reads properties of undefined and the app crashes at
   * the exact moment the user confirmed a destructive action.
   */
  if (!row) {
    return (
      <Screen>
        <ScreenHeader title="Vehicle not found" />
        <EmptyState
          icon="help-circle-outline"
          title="This vehicle is gone"
          body="It may have been deleted. Your other records are unaffected."
          actionLabel="Back to Garage"
          onAction={() => router.replace('/(tabs)/garage')}
        />
      </Screen>
    );
  }

  const { vehicle, financials, sale } = row;
  const { breakdown } = financials;

  const confirmDeleteExpense = async (expenseId: string, label: string) => {
    const go = await confirm({
      title: 'Remove this expense?',
      message: `"${label}" will stop counting toward this vehicle.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (go) withRefresh((db) => deleteExpense(db, expenseId));
  };

  const confirmReverse = async () => {
    const go = await confirm({
      title: 'Undo this sale?',
      message:
        'The car goes back to the garage and the profit, distribution and Fernando’s share are all reversed. Nothing is erased — the history stays.',
      confirmLabel: 'Undo sale',
      destructive: true,
    });
    if (go) withRefresh((db) => reverseSale(db, vehicle.id));
  };

  const confirmDeleteVehicle = async () => {
    const go = await confirm({
      title: 'Delete this vehicle?',
      message: `${vehicleTitle(vehicle)} and everything recorded against it will stop counting toward your totals. This cannot be undone from inside the app.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!go) return;
    withRefresh((db) => reposModule.softDeleteVehicle(db, vehicle.id));
    router.replace('/(tabs)/garage');
  };

  return (
    <>
      <Screen>
        <ScreenHeader
          title={vehicleTitle(vehicle)}
          subtitle={vehicle.vin ? `VIN ${vehicle.vin}` : 'No VIN on file'}
        />

        <Row gap={Space.sm} style={{ marginBottom: Space.lg }}>
          <StatusPill status={vehicle.status} />
          <TypePill type={vehicle.type} />
          {vehicle.type === 'ASSOCIATED' ? (
            <Txt variant="micro" tone="faint">
              50/50 with Fernando
            </Txt>
          ) : null}
        </Row>

        {/* ── The headline number ─────────────────────────────────────── */}
        <Card elevated style={{ marginBottom: Space.lg }}>
          {financials.sold ? (
            <>
              <Txt variant="micro" tone="faint">
                {(financials.grossProfitCents ?? 0) >= 0 ? 'GROSS PROFIT' : 'GROSS LOSS'}
              </Txt>
              <Money
                cents={financials.grossProfitCents}
                variant="display"
                signed
                weight="extrabold"
                style={{ marginTop: 4 }}
              />
              <Row gap={Space.md} style={{ marginTop: Space.sm }}>
                <Row gap={5}>
                  <Txt variant="micro" tone="faint">
                    ROI
                  </Txt>
                  <Percent ratio={financials.roi} variant="small" />
                </Row>
                <Txt variant="micro" tone="faint" numeric>
                  {formatDayCount(financials.daysHeld)} held
                </Txt>
              </Row>
            </>
          ) : (
            <>
              <Txt variant="micro" tone="faint">
                TOTAL INVESTED
              </Txt>
              <Money
                cents={financials.totalInvestedCents}
                variant="display"
                weight="extrabold"
                style={{ marginTop: 4 }}
              />
              <Row gap={Space.md} style={{ marginTop: Space.sm }}>
                <Txt variant="micro" tone="faint" numeric>
                  {formatDayCount(financials.daysHeld)} in the garage
                </Txt>
                {financials.estimatedProfitCents != null ? (
                  <Row gap={5}>
                    <Txt variant="micro" tone="faint">
                      EST.
                    </Txt>
                    <Money cents={financials.estimatedProfitCents} variant="small" signed />
                  </Row>
                ) : null}
              </Row>
            </>
          )}
        </Card>

        {/* ── Investment breakdown ────────────────────────────────────── */}
        <SectionHeader
          title="Investment breakdown"
          action="Add expense"
          onAction={() => setExpenseSheet(true)}
        />
        <Card style={{ marginBottom: Space.lg }}>
          <DataRow
            label="Purchase price"
            valueNode={<Money cents={breakdown.purchasePriceCents} variant="body" />}
          />

          <Divider spacing={Space.sm} />

          <Txt variant="micro" tone="faint" style={{ marginBottom: 4 }}>
            ADDITIONAL INVESTMENT
          </Txt>
          {breakdown.lines.length === 0 ? (
            <Txt variant="small" tone="faint" style={{ paddingVertical: Space.sm }}>
              Nothing spent on this vehicle yet.
            </Txt>
          ) : (
            breakdown.lines.map((line) => (
              <DataRow
                key={line.categoryId}
                label={categoryLabel(line.categoryId)}
                valueNode={<Money cents={line.amountCents} variant="small" tone="muted" />}
                hint={line.count > 1 ? `${line.count} entries` : undefined}
              />
            ))
          )}
          <DataRow
            label="Additional investment"
            valueNode={<Money cents={breakdown.additionalInvestmentCents} variant="body" />}
            emphasis
          />

          <View style={totalPanel}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="body" weight="extrabold">
                Total invested
              </Txt>
              <Money cents={financials.totalInvestedCents} variant="heading" weight="extrabold" />
            </Row>
          </View>

          {financials.fernandoPaidCents > 0 ? (
            <Row gap={6} style={{ marginTop: Space.sm }}>
              <Ionicons name="information-circle-outline" size={13} color={Colors.info} />
              <Txt variant="micro" style={{ color: Colors.info, flex: 1 }}>
                Fernando fronted {formatMoney(financials.fernandoPaidCents)} of this and is owed it
                back.
              </Txt>
            </Row>
          ) : null}
        </Card>

        {/* ── Sale, profit and allocation ─────────────────────────────── */}
        {financials.sold && sale ? (
          <>
            <SectionHeader title="Sale" />
            <Card style={{ marginBottom: Space.lg }}>
              <DataRow label="Sold" value={formatDate(sale.saleDate)} />
              {sale.buyerName ? <DataRow label="Buyer" value={sale.buyerName} /> : null}
              <DataRow
                label="Mileage at sale"
                value={formatMileage(vehicle.mileageOut)}
              />
              <Divider spacing={Space.sm} />
              <DataRow
                label="Sale price"
                valueNode={<Money cents={sale.salePriceCents} variant="body" />}
              />
              <DataRow
                label="Less total invested"
                valueNode={
                  <Money cents={-financials.totalInvestedCents} variant="small" tone="muted" />
                }
              />
              <DataRow
                label={(financials.grossProfitCents ?? 0) >= 0 ? 'Gross profit' : 'Gross loss'}
                valueNode={<Money cents={financials.grossProfitCents} variant="body" signed />}
                emphasis
              />
            </Card>

            <SectionHeader title="Profit allocation" />
            <Card style={{ marginBottom: Space.lg }}>
              <DataRow
                label="Daniel"
                valueNode={<Money cents={sale.danielShareCents} variant="body" signed />}
                hint={vehicle.type === 'MYSELF' ? '100% — worked alone' : '50% share'}
                emphasis
              />
              {vehicle.type === 'ASSOCIATED' ? (
                <DataRow
                  label="Fernando"
                  valueNode={<Money cents={sale.fernandoShareCents} variant="body" signed />}
                  hint={
                    sale.fernandoShareCents < 0
                      ? 'Carried against his future profit'
                      : 'Posted to his balance'
                  }
                  emphasis
                />
              ) : null}

              {sale.danielShareCents > 0 ? (
                <>
                  <Divider spacing={Space.sm} />
                  <Txt variant="micro" tone="faint" style={{ marginBottom: 4 }}>
                    OF DANIEL&apos;S SHARE
                  </Txt>
                  <DataRow
                    label="Reinvested in the business"
                    valueNode={<Money cents={sale.reinvestCents} variant="small" tone="muted" />}
                  />
                  <DataRow
                    label="Distributed to you"
                    valueNode={<Money cents={sale.distributeCents} variant="small" tone="muted" />}
                  />
                </>
              ) : null}
            </Card>
          </>
        ) : (
          <Button
            label="Record the sale"
            icon="cash-outline"
            onPress={() => router.push(`/vehicle/sell?id=${vehicle.id}`)}
            style={{ marginBottom: Space.lg }}
          />
        )}

        {/* ── Expenses ────────────────────────────────────────────────── */}
        <SectionHeader title={`Expenses · ${expenses.length}`} />
        {expenses.length === 0 ? (
          <Card style={{ marginBottom: Space.lg }}>
            <Txt variant="small" tone="faint">
              No expenses recorded.
            </Txt>
          </Card>
        ) : (
          <View style={{ gap: Space.xs, marginBottom: Space.lg }}>
            {expenses.map((expense) => (
              <PressableCard
                key={expense.id}
                onPress={() =>
                  confirmDeleteExpense(expense.id, categoryLabel(expense.categoryId))
                }
                style={{ padding: Space.md }}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Row gap={Space.sm}>
                      <Txt variant="small" weight="semibold">
                        {categoryLabel(expense.categoryId)}
                      </Txt>
                      {expense.paidBy === 'FERNANDO' ? (
                        <Badge label="Fernando paid" tone="info" />
                      ) : null}
                      {expense.fromInventory ? <Badge label="Stock" tone="neutral" /> : null}
                    </Row>
                    <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                      {formatShortDate(expense.date)}
                      {expense.description ? ` · ${expense.description}` : ''}
                    </Txt>
                  </View>
                  <Money cents={expense.amountCents} variant="small" />
                </Row>
              </PressableCard>
            ))}
          </View>
        )}

        {/* ── Details and timeline ────────────────────────────────────── */}
        <SectionHeader title="Details" />
        <Card style={{ marginBottom: Space.lg }}>
          <DataRow label="Purchased" value={formatDate(vehicle.purchaseDate)} />
          <DataRow label="Mileage at purchase" value={formatMileage(vehicle.mileageIn)} />
          {vehicle.mileageOut != null ? (
            <DataRow label="Mileage at sale" value={formatMileage(vehicle.mileageOut)} />
          ) : null}
          <DataRow label="Type" value={vehicle.type === 'MYSELF' ? 'Myself' : 'Associated'} />
          {vehicle.notes ? (
            <>
              <Divider spacing={Space.sm} />
              <Txt variant="micro" tone="faint">
                NOTES
              </Txt>
              <Txt variant="small" tone="muted" style={{ marginTop: 4 }}>
                {vehicle.notes}
              </Txt>
            </>
          ) : null}
        </Card>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <View style={{ gap: Space.sm }}>
          {!financials.sold ? (
            <Button
              label={`Status · ${STATUS_LABELS[vehicle.status]}`}
              variant="secondary"
              icon="swap-horizontal-outline"
              onPress={() => setStatusSheet(true)}
            />
          ) : null}
          <Button
            label="Vehicle report (PDF)"
            variant="secondary"
            icon="document-text-outline"
            onPress={() => router.push(`/reports?vehicle=${vehicle.id}`)}
          />
          {financials.sold ? (
            <Button label="Undo the sale" variant="ghost" onPress={confirmReverse} />
          ) : null}
          <Button label="Delete vehicle" variant="ghost" onPress={confirmDeleteVehicle} />
        </View>
      </Screen>

      <OptionSheet
        visible={statusSheet}
        onClose={() => setStatusSheet(false)}
        title="Change status"
        options={statusOptions}
        selected={vehicle.status}
        onSelect={(status: VehicleStatus) => {
          const result = withRefresh((db) => setVehicleStatus(db, vehicle.id, status));
          if (result && !result.ok) void notify('Could not change status', result.errors.join('\n'));
        }}
      />

      <ExpenseSheet
        visible={expenseSheet}
        onClose={() => setExpenseSheet(false)}
        vehicleId={vehicle.id}
      />
    </>
  );
}

const totalPanel = {
  backgroundColor: Colors.cardElevated,
  borderRadius: Radius.md,
  padding: Space.md,
  marginTop: Space.md,
};
