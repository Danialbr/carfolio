/**
 * CAPITAL — where the money is, and the rule that protects the principal.
 *
 * The screen is laid out to make one distinction impossible to miss: the
 * protected capital figure sits alone in a bordered, gold panel and is followed
 * by an explicit statement that nothing on the rest of the screen can move it.
 * Everything else — deployed, retained, distributed — is profit-side and lives
 * below the line.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space } from '../theme';
import {
  Button,
  Card,
  Divider,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Txt,
} from '../components/ui/primitives';
import { DataRow, Field, Money, MoneyField, TextField } from '../components/ui/money';
import { Sheet } from '../components/ui/Sheet';
import { ScreenHeader } from '../components/domain/ScreenHeader';
import { notify } from '../components/ui/dialog';
import { useApp, withRefresh } from '../state/store';
import { addCapital, addDistribution } from '../db/operations';
import { formatMoney, type Cents } from '../domain/money';
import { formatShortDate, isValidISODate, todayISO } from '../domain/dates';

type SheetMode = 'CAPITAL' | 'DISTRIBUTION' | null;

export default function Capital() {
  const position = useApp((s) => s.position);
  const capitalEvents = useApp((s) => s.snapshot.capitalEvents);
  const distributions = useApp((s) => s.snapshot.distributions);

  const [mode, setMode] = useState<SheetMode>(null);
  const [amountCents, setAmountCents] = useState<Cents>(0);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [kind, setKind] = useState<'CONTRIBUTION' | 'WITHDRAWAL'>('CONTRIBUTION');

  const close = () => {
    setMode(null);
    setAmountCents(0);
    setNotes('');
    setDate(todayISO());
    setKind('CONTRIBUTION');
  };

  const save = () => {
    if (amountCents <= 0 || !isValidISODate(date)) return;
    const result = withRefresh((db) =>
      mode === 'CAPITAL'
        ? addCapital(db, amountCents, date, notes.trim(), kind)
        : addDistribution(db, amountCents, date, notes.trim()),
    );
    if (result && !result.ok) {
      void notify('Could not save', result.errors.join('\n'));
      return;
    }
    close();
  };

  return (
    <>
      <Screen>
        <ScreenHeader title="Capital" subtitle="Your money, and what it is doing" />

        {/* The principal. Set apart on purpose. */}
        <View style={principalPanel}>
          <Row gap={6}>
            <Ionicons name="lock-closed" size={14} color={Colors.brand} />
            <Txt variant="label" style={{ color: Colors.brand }}>
              Protected capital
            </Txt>
          </Row>
          <Money
            cents={position.protectedCapitalCents}
            variant="display"
            weight="extrabold"
            style={{ marginTop: Space.sm }}
          />
          <Txt variant="small" tone="muted" style={{ marginTop: Space.sm }}>
            This is your principal. Selling a car at a profit does not increase it, and taking a
            distribution does not reduce it. Only a contribution or a withdrawal moves this number.
          </Txt>
        </View>

        <SectionHeader title="Where it is right now" style={{ marginTop: Space.xl }} />
        <Card style={{ marginBottom: Space.lg }}>
          <DataRow
            label="Available to invest"
            valueNode={<Money cents={position.cashOnHandCents} variant="body" />}
            hint="Cash on hand"
            emphasis
          />
          <DataRow
            label="Deployed in vehicles"
            valueNode={<Money cents={position.capitalDeployedCents} variant="small" />}
            hint="Tied up in cars you haven't sold"
          />
          <DataRow
            label="Held as stock"
            valueNode={<Money cents={position.inventoryValueCents} variant="small" />}
            hint="Inventory not yet used on a vehicle"
          />
          {position.owedToFernandoCents !== 0 ? (
            <DataRow
              label={position.owedToFernandoCents > 0 ? 'Owed to Fernando' : 'Fernando carries'}
              valueNode={
                <Money cents={Math.abs(position.owedToFernandoCents)} variant="small" />
              }
              hint={
                position.owedToFernandoCents > 0
                  ? 'Included in your cash but not yours to spend'
                  : 'Losses carried against his future profit'
              }
            />
          ) : null}
        </Card>

        <SectionHeader title="Profit side" />
        <Card style={{ marginBottom: Space.lg }}>
          <DataRow
            label="Lifetime gross profit"
            valueNode={<Money cents={position.grossProfitCents} variant="body" signed />}
            emphasis
          />
          <DataRow
            label="Retained in the business"
            valueNode={<Money cents={position.retainedEarningsCents} variant="small" signed />}
            hint="Your realized share, less what you have taken out"
          />
          <DataRow
            label="Cumulative reinvestment"
            valueNode={<Money cents={position.cumulativeReinvestmentCents} variant="small" />}
            hint="The reinvest decisions you recorded at each sale"
          />
          <DataRow
            label="Distributed to you"
            valueNode={<Money cents={position.totalDistributionsCents} variant="small" />}
          />
          <DataRow
            label="Capital returned"
            valueNode={<Money cents={position.capitalReturnedCents} variant="small" />}
            hint="Principal that came back through sales"
          />
        </Card>

        <Row gap={Space.sm} style={{ marginBottom: Space.xl }}>
          <Button
            label="Add capital"
            icon="add-circle-outline"
            onPress={() => setMode('CAPITAL')}
            style={{ flex: 1 }}
          />
          <Button
            label="Take a draw"
            variant="secondary"
            icon="arrow-up-circle-outline"
            onPress={() => setMode('DISTRIBUTION')}
            style={{ flex: 1 }}
          />
        </Row>

        <SectionHeader title={`Capital events · ${capitalEvents.length}`} />
        <Card style={{ marginBottom: Space.lg }}>
          {capitalEvents.length === 0 ? (
            <Txt variant="small" tone="faint">
              No capital recorded yet. Add your starting principal to make the dashboard figures
              meaningful.
            </Txt>
          ) : (
            capitalEvents.map((event, index) => (
              <View key={event.id}>
                {index > 0 ? <Divider spacing={Space.xs} /> : null}
                <DataRow
                  label={event.kind === 'CONTRIBUTION' ? 'Contribution' : 'Withdrawal'}
                  valueNode={
                    <Money
                      cents={event.kind === 'CONTRIBUTION' ? event.amountCents : -event.amountCents}
                      variant="small"
                      signed
                    />
                  }
                  hint={`${formatShortDate(event.date)}${event.notes ? ` · ${event.notes}` : ''}`}
                />
              </View>
            ))
          )}
        </Card>

        <SectionHeader title={`Distributions · ${distributions.length}`} />
        <Card>
          {distributions.length === 0 ? (
            <Txt variant="small" tone="faint">
              You haven&apos;t taken any profit out of the business yet.
            </Txt>
          ) : (
            distributions.map((distribution, index) => (
              <View key={distribution.id}>
                {index > 0 ? <Divider spacing={Space.xs} /> : null}
                <DataRow
                  label={distribution.reason || 'Distribution'}
                  valueNode={<Money cents={distribution.amountCents} variant="small" />}
                  hint={formatShortDate(distribution.date)}
                />
              </View>
            ))
          )}
        </Card>
      </Screen>

      <Sheet
        visible={mode !== null}
        onClose={close}
        title={mode === 'CAPITAL' ? 'Capital' : 'Take a draw'}
        subtitle={
          mode === 'CAPITAL'
            ? 'Money you are putting into or taking out of the business as principal'
            : 'Profit you are taking out. Your principal is not affected.'
        }
      >
        {mode === 'CAPITAL' ? (
          <Segmented
            options={[
              { value: 'CONTRIBUTION' as const, label: 'Put in' },
              { value: 'WITHDRAWAL' as const, label: 'Take out' },
            ]}
            value={kind}
            onChange={setKind}
            style={{ marginBottom: Space.lg }}
          />
        ) : null}

        <Field label="Amount">
          <MoneyField cents={amountCents} onChange={setAmountCents} autoFocus />
        </Field>
        <Field label="Date" error={isValidISODate(date) ? null : 'Use YYYY-MM-DD'}>
          <TextField value={date} onChangeText={setDate} autoCapitalize="none" />
        </Field>
        <Field label={mode === 'CAPITAL' ? 'Notes' : 'Reason'} hint="Optional">
          <TextField
            value={notes}
            onChangeText={setNotes}
            placeholder={mode === 'CAPITAL' ? 'Initial capital' : 'Owner draw'}
          />
        </Field>

        {mode === 'DISTRIBUTION' && amountCents > position.cashOnHandCents ? (
          <Txt variant="micro" style={{ color: Colors.warn, marginBottom: Space.md }}>
            That is more than the {formatMoney(position.cashOnHandCents)} you have available.
            Recording it anyway is allowed — the figure will simply go negative.
          </Txt>
        ) : null}

        <Button
          label={amountCents > 0 ? `Record ${formatMoney(amountCents)}` : 'Record'}
          onPress={save}
          disabled={amountCents <= 0 || !isValidISODate(date)}
        />
      </Sheet>
    </>
  );
}

const principalPanel = {
  backgroundColor: Colors.brandSoft,
  borderWidth: 1,
  borderColor: Colors.brandBorder,
  borderRadius: Radius.lg,
  padding: Space.lg,
};
