/**
 * FERNANDO — one balance, and the entries that made it.
 *
 * Deliberately not a "partner management system": there is one other person,
 * he has no login, and the only questions worth answering are how much he is
 * owed, what it is made of, and what has been paid.
 *
 * The two components of the balance are shown separately because they behave
 * differently. Reimbursements are money he actually spent and should get back
 * regardless of how the car did. Profit share is his half of a result, and it
 * can be negative.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space } from '../theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Row,
  Screen,
  SectionHeader,
  Txt,
} from '../components/ui/primitives';
import { DataRow, Field, Money, MoneyField, TextField } from '../components/ui/money';
import { Sheet } from '../components/ui/Sheet';
import { ScreenHeader } from '../components/domain/ScreenHeader';
import { notify } from '../components/ui/dialog';
import { useApp, withRefresh } from '../state/store';
import { payFernando } from '../db/operations';
import { formatMoney, type Cents } from '../domain/money';
import { formatShortDate, isValidISODate, todayISO } from '../domain/dates';
import { vehicleTitleShort } from '../domain/vehicle';
import type { FernandoEntryKind } from '../domain/types';

const KIND_LABEL: Record<FernandoEntryKind, string> = {
  PROFIT_SHARE: 'Profit share',
  REIMBURSEMENT: 'Reimbursement',
  PAYMENT: 'Paid',
};

export default function Fernando() {
  const account = useApp((s) => s.fernando);
  const entries = useApp((s) => s.snapshot.fernandoEntries);
  const vehicles = useApp((s) => s.snapshot.vehicles);

  const [paying, setPaying] = useState(false);
  const [amountCents, setAmountCents] = useState<Cents>(0);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');

  const owed = account.balanceCents;

  const close = () => {
    setPaying(false);
    setAmountCents(0);
    setNotes('');
    setDate(todayISO());
  };

  const save = () => {
    if (amountCents <= 0 || !isValidISODate(date)) return;
    const result = withRefresh((db) => payFernando(db, amountCents, date, notes.trim()));
    if (result && !result.ok) {
      void notify('Could not record the payment', result.errors.join('\n'));
      return;
    }
    close();
  };

  const vehicleName = (vehicleId: string | null) => {
    if (!vehicleId) return null;
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    return vehicle ? vehicleTitleShort(vehicle) : null;
  };

  return (
    <>
      <Screen>
        <ScreenHeader title="Fernando" subtitle="Associated vehicles, 50/50" />

        <Card elevated style={{ marginBottom: Space.lg }}>
          <Txt variant="micro" tone="faint">
            {owed >= 0 ? 'YOU OWE FERNANDO' : 'FERNANDO IS CARRYING'}
          </Txt>
          <Money
            cents={Math.abs(owed)}
            variant="display"
            weight="extrabold"
            style={{ marginTop: 4 }}
          />
          <Txt variant="small" tone="faint" style={{ marginTop: Space.sm }}>
            {owed > 0
              ? 'His profit share plus what he paid out of pocket, less what you have settled.'
              : owed < 0
                ? 'Losses carried forward. They net against his share of the next winning car — no cash changes hands.'
                : 'Everything is settled.'}
          </Txt>
        </Card>

        <SectionHeader title="What it is made of" />
        <Card style={{ marginBottom: Space.lg }}>
          <DataRow
            label="Profit share"
            valueNode={<Money cents={account.profitSharesCents} variant="body" signed />}
            hint="His 50% of every associated sale, wins and losses"
          />
          <DataRow
            label="Expenses he paid"
            valueNode={<Money cents={account.reimbursementsDueCents} variant="body" />}
            hint="Money out of his own pocket, owed back regardless of how the car did"
          />
          <DataRow
            label="Already paid"
            valueNode={<Money cents={-account.paymentsMadeCents} variant="body" />}
          />
          <Divider spacing={Space.sm} />
          <DataRow
            label="Balance"
            valueNode={<Money cents={owed} variant="heading" signed />}
            emphasis
          />
        </Card>

        {owed > 0 ? (
          <Button
            label={`Settle up · ${formatMoney(owed)}`}
            icon="cash-outline"
            onPress={() => {
              setAmountCents(owed);
              setPaying(true);
            }}
            style={{ marginBottom: Space.sm }}
          />
        ) : null}
        <Button
          label="Record a payment"
          variant="secondary"
          icon="add-circle-outline"
          onPress={() => setPaying(true)}
          style={{ marginBottom: Space.xl }}
        />

        <SectionHeader title={`History · ${entries.length}`} />
        {entries.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Nothing yet"
            body="Entries appear here when an associated vehicle sells, or when Fernando pays for something."
          />
        ) : (
          <Card>
            {entries.map((entry, index) => {
              const name = vehicleName(entry.vehicleId);
              return (
                <View key={entry.id}>
                  {index > 0 ? <Divider spacing={Space.xs} /> : null}
                  <Row style={{ justifyContent: 'space-between', paddingVertical: 7 }} gap={Space.md}>
                    <View style={{ flex: 1 }}>
                      <Row gap={Space.sm}>
                        <Txt variant="small" weight="semibold">
                          {KIND_LABEL[entry.kind]}
                        </Txt>
                        {entry.kind === 'REIMBURSEMENT' ? (
                          <Badge label="Out of pocket" tone="info" />
                        ) : null}
                      </Row>
                      <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                        {formatShortDate(entry.date)}
                        {name ? ` · ${name}` : ''}
                        {entry.notes ? ` · ${entry.notes}` : ''}
                      </Txt>
                    </View>
                    <Money cents={entry.amountCents} variant="small" signed />
                  </Row>
                </View>
              );
            })}
          </Card>
        )}

        <Row gap={6} style={{ marginTop: Space.lg, alignItems: 'flex-start' }}>
          <Ionicons name="lock-closed-outline" size={13} color={Colors.text2} style={{ marginTop: 4 }} />
          <Txt variant="micro" tone="faint" style={{ flex: 1 }}>
            Fernando has no access to this app. Send him a PDF report when you want him to see where
            a car landed.
          </Txt>
        </Row>
      </Screen>

      <Sheet
        visible={paying}
        onClose={close}
        title="Record a payment"
        subtitle="Money you have actually handed to Fernando"
      >
        <Field label="Amount">
          <MoneyField cents={amountCents} onChange={setAmountCents} autoFocus />
        </Field>
        <Field label="Date" error={isValidISODate(date) ? null : 'Use YYYY-MM-DD'}>
          <TextField value={date} onChangeText={setDate} autoCapitalize="none" />
        </Field>
        <Field label="Notes" hint="Optional">
          <TextField value={notes} onChangeText={setNotes} placeholder="Zelle, cash, etc." />
        </Field>

        {amountCents > 0 && owed > 0 ? (
          <View style={remainderPanel}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small" tone="muted">
                Balance after this
              </Txt>
              <Money cents={owed - amountCents} variant="small" signed />
            </Row>
          </View>
        ) : null}

        <Button
          label={amountCents > 0 ? `Record ${formatMoney(amountCents)}` : 'Record payment'}
          onPress={save}
          disabled={amountCents <= 0 || !isValidISODate(date)}
        />
      </Sheet>
    </>
  );
}

const remainderPanel = {
  backgroundColor: Colors.cardElevated,
  borderRadius: Radius.md,
  padding: Space.md,
  marginBottom: Space.lg,
};
