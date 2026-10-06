/**
 * RECORD A SALE
 *
 * The one screen in the app that writes to four tables at once, so it is built
 * as a guided flow with a live preview rather than a form with a save button.
 * Every number updates as the sale price is typed, and the summary at the
 * bottom is exactly what will be written.
 *
 * The important thing this screen teaches, by construction: on an ASSOCIATED
 * vehicle Fernando's half is taken off the top and shown as already his. The
 * reinvest/distribute slider only ever moves Daniel's half. It is not possible
 * to express "reinvest Fernando's share" here, because that is not a thing you
 * are allowed to do.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space } from '../../theme';
import {
  Button,
  Card,
  Divider,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Txt,
} from '../../components/ui/primitives';
import { DataRow, Field, Money, MoneyField, Percent, TextField } from '../../components/ui/money';
import { ScreenHeader } from '../../components/domain/ScreenHeader';
import { notify } from '../../components/ui/dialog';
import { useApp, selectVehicle, withRefresh } from '../../state/store';
import { recordSale } from '../../db/operations';
import { postingsForSale } from '../../domain/postings';
import { isValidISODate, todayISO, daysBetween, formatDayCount } from '../../domain/dates';
import { formatMoney, roi, splitHalf, type Cents } from '../../domain/money';
import { vehicleTitle } from '../../domain/vehicle';

type Split = 'ALL_IN' | 'HALF' | 'ALL_OUT';

export default function SellVehicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const row = useApp((s) => selectVehicle(s, id ?? ''));
  const allExpenses = useApp((s) => s.snapshot.expenses);
  const expenses = useMemo(
    () => allExpenses.filter((e) => e.vehicleId === id),
    [allExpenses, id],
  );

  const [priceCents, setPriceCents] = useState<Cents>(0);
  const [saleDate, setSaleDate] = useState(todayISO());
  const [buyerName, setBuyerName] = useState('');
  const [mileageOut, setMileageOut] = useState('');
  const [notes, setNotes] = useState('');
  const [split, setSplit] = useState<Split>('ALL_IN');
  const [saving, setSaving] = useState(false);

  const invested = row?.financials.totalInvestedCents ?? 0;
  const gross = priceCents - invested;

  // Fernando's half comes off first. Only what remains is Daniel's to allocate.
  const { danielCents, fernandoCents } = useMemo(() => {
    if (!row) return { danielCents: 0, fernandoCents: 0 };
    if (row.vehicle.type === 'MYSELF') return { danielCents: gross, fernandoCents: 0 };
    const { first, second } = splitHalf(gross);
    return { danielCents: first, fernandoCents: second };
  }, [row, gross]);

  const allocatable = Math.max(0, danielCents);
  const { reinvestCents, distributeCents } = useMemo(() => {
    if (allocatable === 0) return { reinvestCents: 0, distributeCents: 0 };
    if (split === 'ALL_IN') return { reinvestCents: allocatable, distributeCents: 0 };
    if (split === 'ALL_OUT') return { reinvestCents: 0, distributeCents: allocatable };
    const { first, second } = splitHalf(allocatable);
    // The odd cent stays in the business rather than going out.
    return { reinvestCents: first, distributeCents: second };
  }, [split, allocatable]);

  const dateValid = isValidISODate(saleDate);
  const held = row ? daysBetween(row.vehicle.purchaseDate, saleDate) : null;

  // The same function the write path uses, so the preview cannot disagree with
  // what actually gets saved.
  const preview = useMemo(() => {
    if (!row) return null;
    return postingsForSale(
      {
        vehicle: row.vehicle,
        expenses,
        saleDate,
        salePriceCents: priceCents,
        buyerName,
        mileageOut: null,
        notes,
        reinvestCents,
        distributeCents,
      },
      { newId: () => 'preview', now: '' },
    );
  }, [row, expenses, saleDate, priceCents, buyerName, notes, reinvestCents, distributeCents]);

  if (!row) {
    return (
      <Screen>
        <ScreenHeader title="Vehicle not found" />
      </Screen>
    );
  }

  const { vehicle } = row;
  const canSave = priceCents > 0 && dateValid && (preview?.ok ?? false);

  const save = () => {
    if (!canSave || saving) return;
    setSaving(true);
    const result = withRefresh((db) =>
      recordSale(db, {
        vehicleId: vehicle.id,
        saleDate,
        salePriceCents: priceCents,
        buyerName: buyerName.trim(),
        mileageOut: mileageOut.trim() === '' ? null : Number(mileageOut.replace(/[^0-9]/g, '')),
        notes: notes.trim(),
        reinvestCents,
        distributeCents,
      }),
    );
    setSaving(false);

    if (!result || !result.ok) {
      void notify('Could not record the sale', result?.errors.join('\n') ?? 'Something went wrong.');
      return;
    }
    router.replace(`/vehicle/${vehicle.id}`);
  };

  return (
    <Screen>
      <ScreenHeader title="Record the sale" subtitle={vehicleTitle(vehicle)} />

      <SectionHeader title="Sale" />
      <Card style={{ marginBottom: Space.lg }}>
        <Field label="Sale price" hint={`You have ${formatMoney(invested)} invested in this car`}>
          <MoneyField cents={priceCents} onChange={setPriceCents} autoFocus />
        </Field>
        <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
          <Field label="Sale date" style={{ flex: 1 }} error={dateValid ? null : 'Use YYYY-MM-DD'}>
            <TextField value={saleDate} onChangeText={setSaleDate} autoCapitalize="none" />
          </Field>
          <Field label="Mileage at sale" style={{ flex: 1 }}>
            <TextField
              value={mileageOut}
              onChangeText={setMileageOut}
              placeholder="88,400"
              keyboardType="number-pad"
            />
          </Field>
        </Row>
        <Field label="Buyer" hint="Optional">
          <TextField value={buyerName} onChangeText={setBuyerName} placeholder="Name" autoCapitalize="words" />
        </Field>
      </Card>

      {/* ── Live result ─────────────────────────────────────────────── */}
      <SectionHeader title="Result" />
      <Card elevated style={{ marginBottom: Space.lg }}>
        <DataRow label="Sale price" valueNode={<Money cents={priceCents} variant="body" />} />
        <DataRow
          label="Less total invested"
          valueNode={<Money cents={-invested} variant="small" tone="muted" />}
        />
        <Divider spacing={Space.sm} />
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Txt variant="micro" tone="faint">
              {gross >= 0 ? 'GROSS PROFIT' : 'GROSS LOSS'}
            </Txt>
            <Money cents={gross} variant="title" signed weight="extrabold" style={{ marginTop: 4 }} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt variant="micro" tone="faint">
              ROI
            </Txt>
            <Percent ratio={roi(gross, invested)} variant="heading" />
            {held != null ? (
              <Txt variant="micro" tone="faint" numeric style={{ marginTop: 4 }}>
                {formatDayCount(held)}
              </Txt>
            ) : null}
          </View>
        </Row>
      </Card>

      {/* ── Who gets what ───────────────────────────────────────────── */}
      <SectionHeader title="Profit allocation" />
      <Card style={{ marginBottom: Space.lg }}>
        {vehicle.type === 'ASSOCIATED' ? (
          <>
            <View style={fernandoPanel}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="micro" weight="bold" style={{ color: Colors.info }}>
                    FERNANDO — 50%
                  </Txt>
                  <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                    {fernandoCents < 0
                      ? 'Carried against his future profit share. No cash changes hands.'
                      : 'His the moment this car sells. Posted to his balance.'}
                  </Txt>
                </View>
                <Money cents={fernandoCents} variant="heading" signed weight="extrabold" />
              </Row>
            </View>
            <DataRow
              label="Your share — 50%"
              valueNode={<Money cents={danielCents} variant="body" signed />}
              emphasis
            />
          </>
        ) : (
          <DataRow
            label="Your share — 100%"
            valueNode={<Money cents={danielCents} variant="body" signed />}
            hint="You worked this one alone"
            emphasis
          />
        )}

        {allocatable > 0 ? (
          <>
            <Divider spacing={Space.md} />
            <Txt variant="label" tone="faint" style={{ marginBottom: 4 }}>
              What happens to your {formatMoney(allocatable)}
            </Txt>
            <Segmented
              options={[
                { value: 'ALL_IN' as const, label: 'Keep in' },
                { value: 'HALF' as const, label: 'Split' },
                { value: 'ALL_OUT' as const, label: 'Take out' },
              ]}
              value={split}
              onChange={setSplit}
              style={{ marginBottom: Space.md }}
            />
            <DataRow
              label="Reinvested in the business"
              valueNode={<Money cents={reinvestCents} variant="small" />}
            />
            <DataRow
              label="Distributed to you"
              valueNode={<Money cents={distributeCents} variant="small" />}
            />
            <Row gap={6} style={{ marginTop: Space.sm }}>
              <Ionicons name="lock-closed" size={12} color={Colors.brand} />
              <Txt variant="micro" tone="faint" style={{ flex: 1 }}>
                Either way your protected capital stays exactly where it is.
              </Txt>
            </Row>
          </>
        ) : gross < 0 ? (
          <>
            <Divider spacing={Space.md} />
            <Txt variant="micro" tone="faint">
              There is nothing to allocate on a losing sale. The loss reduces your retained
              earnings; your principal is untouched.
            </Txt>
          </>
        ) : null}
      </Card>

      <Field label="Notes" hint="Optional">
        <TextField value={notes} onChangeText={setNotes} placeholder="How the sale went" multiline />
      </Field>

      {preview && !preview.ok && priceCents > 0 ? (
        <Card style={{ borderColor: Colors.loss, marginBottom: Space.md }}>
          {preview.errors.map((error) => (
            <Txt key={error} variant="small" style={{ color: Colors.loss }}>
              {error}
            </Txt>
          ))}
        </Card>
      ) : null}

      <View style={{ gap: Space.sm }}>
        <Button
          label={priceCents > 0 ? `Record sale · ${formatMoney(gross, { signed: true })}` : 'Record sale'}
          onPress={save}
          disabled={!canSave}
          loading={saving}
        />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const fernandoPanel = {
  backgroundColor: Colors.infoSoft,
  borderWidth: 1,
  borderColor: '#254256',
  borderRadius: Radius.md,
  padding: Space.md,
  marginBottom: Space.sm,
};
