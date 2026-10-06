/**
 * ADD A VEHICLE
 *
 * One screen, not a wizard. Buying a car is a single event and the person
 * entering it already has the paperwork in front of them; splitting it across
 * four steps would add taps without adding clarity.
 *
 * The purchase price is given its own emphasised block, apart from the identity
 * fields, because it is the first half of the distinction the whole app rests
 * on: purchase price is not the same thing as additional investment.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { notify } from '../../components/ui/dialog';
import { Colors, Space } from '../../theme';
import {
  Button,
  Card,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Txt,
} from '../../components/ui/primitives';
import { Field, MoneyField, SelectField, TextField } from '../../components/ui/money';
import { OptionSheet } from '../../components/ui/Sheet';
import { ScreenHeader } from '../../components/domain/ScreenHeader';
import { withRefresh } from '../../state/store';
import { createVehicle } from '../../db/operations';
import { todayISO, isValidISODate } from '../../domain/dates';
import { normalizeVin, validateVin } from '../../domain/vehicle';
import type { PaidBy, VehicleType } from '../../domain/types';
import { formatMoney, type Cents } from '../../domain/money';

const PAYERS: readonly { value: PaidBy; label: string; detail: string }[] = [
  { value: 'DANIEL', label: 'Daniel', detail: 'You paid — the usual case' },
  { value: 'BUSINESS', label: 'Business', detail: 'Paid from business funds' },
  { value: 'FERNANDO', label: 'Fernando', detail: 'He paid — he gets reimbursed' },
];

export default function NewVehicle() {
  const router = useRouter();

  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [vin, setVin] = useState('');
  const [mileage, setMileage] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [type, setType] = useState<VehicleType>('MYSELF');
  const [priceCents, setPriceCents] = useState<Cents>(0);
  const [paidBy, setPaidBy] = useState<PaidBy>('DANIEL');
  const [estimateCents, setEstimateCents] = useState<Cents>(0);
  const [notes, setNotes] = useState('');

  const [payerSheet, setPayerSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const vinCheck = validateVin(vin);
  const dateValid = isValidISODate(purchaseDate);
  const canSave = (make.trim() !== '' || model.trim() !== '') && dateValid && vinCheck.ok;

  const save = () => {
    if (!canSave || saving) return;
    setSaving(true);

    const result = withRefresh((db) =>
      createVehicle(db, {
        year: year.trim() === '' ? null : Number(year),
        make,
        model,
        trim,
        vin: normalizeVin(vin),
        mileageIn: mileage.trim() === '' ? null : Number(mileage.replace(/[^0-9]/g, '')),
        purchaseDate,
        type,
        purchasePriceCents: priceCents,
        purchasePaidBy: paidBy,
        estimatedSalePriceCents: estimateCents > 0 ? estimateCents : null,
        notes: notes.trim(),
      }),
    );

    setSaving(false);
    if (!result || !result.ok) {
      void notify('Could not save', result?.errors.join('\n') ?? 'The database is not ready yet.');
      return;
    }
    router.replace(`/vehicle/${result.value!.id}`);
  };

  return (
    <>
      <Screen>
        <ScreenHeader title="Add a vehicle" />

        <SectionHeader title="Vehicle" />
        <Card style={{ marginBottom: Space.lg }}>
          <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
            <Field label="Year" style={{ flex: 1 }}>
              <TextField
                value={year}
                onChangeText={(v) => setYear(v.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="2018"
                keyboardType="number-pad"
              />
            </Field>
            <Field label="Make" style={{ flex: 2 }}>
              <TextField value={make} onChangeText={setMake} placeholder="Toyota" autoCapitalize="words" />
            </Field>
          </Row>

          <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
            <Field label="Model" style={{ flex: 2 }}>
              <TextField value={model} onChangeText={setModel} placeholder="Camry" autoCapitalize="words" />
            </Field>
            <Field label="Trim" style={{ flex: 1 }}>
              <TextField value={trim} onChangeText={setTrim} placeholder="SE" autoCapitalize="characters" />
            </Field>
          </Row>

          <Field
            label="VIN"
            hint="Optional — some project cars genuinely have none"
            error={vinCheck.ok ? null : vinCheck.message}
          >
            <TextField
              value={vin}
              onChangeText={(v) => setVin(v.toUpperCase())}
              placeholder="17 characters"
              autoCapitalize="characters"
              maxLength={17}
            />
            {/* A failed check digit is almost always a typo, but rebuilt-title
                cars sometimes carry VINs that fail it — so this warns and still
                lets the save through. */}
            {vinCheck.suspicious ? (
              <Txt variant="micro" style={{ color: Colors.warn, marginTop: 4 }}>
                {vinCheck.message}
              </Txt>
            ) : null}
          </Field>

          <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
            <Field label="Mileage at purchase" style={{ flex: 1 }}>
              <TextField
                value={mileage}
                onChangeText={setMileage}
                placeholder="84,120"
                keyboardType="number-pad"
              />
            </Field>
            <Field
              label="Purchase date"
              style={{ flex: 1 }}
              error={dateValid ? null : 'Use YYYY-MM-DD'}
            >
              <TextField
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
            </Field>
          </Row>

          <Field
            label="Vehicle type"
            hint={
              type === 'MYSELF'
                ? '100% of the profit or loss is yours'
                : 'Profit and loss split 50/50 with Fernando'
            }
          >
            <Segmented
              options={[
                { value: 'MYSELF' as const, label: 'Myself' },
                { value: 'ASSOCIATED' as const, label: 'Associated' },
              ]}
              value={type}
              onChange={setType}
            />
          </Field>
        </Card>

        {/* The purchase price gets its own card. It is never additional
            investment, and the interface should say so before the first
            expense is ever entered. */}
        <SectionHeader title="Purchase" />
        <Card style={{ marginBottom: Space.lg, borderColor: Colors.brandBorder }}>
          <Field label="Purchase price" hint="Everything else you spend is additional investment">
            <MoneyField cents={priceCents} onChange={setPriceCents} />
          </Field>
          <Field label="Paid by">
            <SelectField
              value={PAYERS.find((p) => p.value === paidBy)?.label ?? null}
              placeholder="Who paid"
              onPress={() => setPayerSheet(true)}
            />
          </Field>
          {paidBy === 'FERNANDO' ? (
            <Txt variant="micro" style={{ color: Colors.info, marginTop: -Space.sm }}>
              Fernando will be recorded as owed this amount back.
            </Txt>
          ) : null}
        </Card>

        <SectionHeader title="Optional" />
        <Card>
          <Field label="Estimated sale price" hint="Used to project profit while it sits in the garage">
            <MoneyField cents={estimateCents} onChange={setEstimateCents} />
          </Field>
          <Field label="Notes">
            <TextField
              value={notes}
              onChangeText={setNotes}
              placeholder="Where you bought it, what it needs…"
              multiline
            />
          </Field>
        </Card>

        <View style={{ marginTop: Space.xl, gap: Space.sm }}>
          <Button
            label={priceCents > 0 ? `Add vehicle · ${formatMoney(priceCents)}` : 'Add vehicle'}
            onPress={save}
            disabled={!canSave}
            loading={saving}
          />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
        {!canSave ? (
          <Txt variant="micro" tone="faint" center style={{ marginTop: Space.sm }}>
            {make.trim() === '' && model.trim() === ''
              ? 'Enter at least a make or a model.'
              : !dateValid
                ? 'Check the purchase date.'
                : vinCheck.message}
          </Txt>
        ) : null}
      </Screen>

      <OptionSheet
        visible={payerSheet}
        onClose={() => setPayerSheet(false)}
        title="Who paid?"
        options={PAYERS}
        selected={paidBy}
        onSelect={setPaidBy}
      />
    </>
  );
}


