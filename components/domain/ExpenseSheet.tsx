/**
 * FAST EXPENSE ENTRY
 *
 * Optimised for the case that actually happens: standing in a parts shop with a
 * receipt. Amount first and auto-focused, category next, everything else
 * defaulted. Date defaults to today, payer defaults to Daniel, description is
 * optional.
 *
 * It also offers drawing from Inventory, because "I used two of my own bottles
 * of oil" is an expense on the car that must not spend cash a second time.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Colors, Space } from '../../theme';
import { Button, Row, Segmented, Txt } from '../ui/primitives';
import { Field, MoneyField, SelectField, TextField } from '../ui/money';
import { OptionSheet, Sheet, type Option } from '../ui/Sheet';
import { notify } from '../../components/ui/dialog';
import { useApp, withRefresh } from '../../state/store';
import { addExpense, drawInventory } from '../../db/operations';
import {
  GROUP_LABELS,
  GROUP_ORDER,
  categoryLabel,
  selectableCategories,
} from '../../domain/categories';
import { formatMoney, type Cents } from '../../domain/money';
import { isValidISODate, todayISO } from '../../domain/dates';
import type { PaidBy } from '../../domain/types';

const PAYERS: readonly Option<PaidBy>[] = [
  { value: 'DANIEL', label: 'Daniel', detail: 'You paid' },
  { value: 'BUSINESS', label: 'Business', detail: 'Paid from business funds' },
  { value: 'FERNANDO', label: 'Fernando', detail: 'He paid — he gets reimbursed' },
];

type Mode = 'CASH' | 'STOCK';

export function ExpenseSheet({
  visible,
  onClose,
  vehicleId,
}: {
  visible: boolean;
  onClose: () => void;
  vehicleId: string;
}) {
  // Same rule: select the stable array, filter in a memo.
  const allInventory = useApp((s) => s.snapshot.inventory);
  const inventory = useMemo(() => allInventory.filter((i) => i.quantity > 0), [allInventory]);

  const [mode, setMode] = useState<Mode>('CASH');
  const [amountCents, setAmountCents] = useState<Cents>(0);
  const [categoryId, setCategoryId] = useState<string>('PARTS');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [paidBy, setPaidBy] = useState<PaidBy>('DANIEL');

  const [itemId, setItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');

  const [categorySheet, setCategorySheet] = useState(false);
  const [payerSheet, setPayerSheet] = useState(false);
  const [itemSheet, setItemSheet] = useState(false);

  const categoryOptions = useMemo<Option<string>[]>(() => {
    const all = selectableCategories();
    return GROUP_ORDER.flatMap((group) =>
      all
        .filter((c) => c.group === group)
        .map((c) => ({ value: c.id, label: c.label, group: GROUP_LABELS[group] })),
    );
  }, []);

  const itemOptions = useMemo<Option<string>[]>(
    () =>
      inventory.map((i) => ({
        value: i.id,
        label: i.name,
        detail: `${i.quantity} in stock · ${formatMoney(i.unitCostCents)} each`,
      })),
    [inventory],
  );

  const selectedItem = inventory.find((i) => i.id === itemId) ?? null;
  const dateValid = isValidISODate(date);

  const reset = () => {
    setAmountCents(0);
    setDescription('');
    setDate(todayISO());
    setPaidBy('DANIEL');
    setQuantity('1');
    setItemId(null);
    setMode('CASH');
  };

  const close = () => {
    reset();
    onClose();
  };

  const canSaveCash = amountCents > 0 && dateValid;
  const canSaveStock =
    selectedItem != null && Number(quantity) > 0 && Number(quantity) <= selectedItem.quantity;

  const save = () => {
    if (mode === 'CASH') {
      if (!canSaveCash) return;
      const result = withRefresh((db) =>
        addExpense(db, {
          vehicleId,
          categoryId,
          amountCents,
          date,
          description: description.trim(),
          paidBy,
        }),
      );
      if (result && !result.ok) {
        void notify('Could not add expense', result.errors.join('\n'));
        return;
      }
    } else {
      if (!canSaveStock || !selectedItem) return;
      const result = withRefresh((db) =>
        drawInventory(db, selectedItem.id, vehicleId, Number(quantity), date),
      );
      if (result && !result.ok) {
        void notify('Could not use stock', result.errors.join('\n'));
        return;
      }
    }
    close();
  };

  return (
    <>
      <Sheet visible={visible} onClose={close} title="Add expense">
        {inventory.length > 0 ? (
          <Segmented
            options={[
              { value: 'CASH' as const, label: 'New expense' },
              { value: 'STOCK' as const, label: 'Use stock' },
            ]}
            value={mode}
            onChange={setMode}
            style={{ marginBottom: Space.lg }}
          />
        ) : null}

        {mode === 'CASH' ? (
          <>
            <Field label="Amount">
              <MoneyField cents={amountCents} onChange={setAmountCents} autoFocus />
            </Field>

            <Field label="Category">
              <SelectField
                value={categoryLabel(categoryId)}
                placeholder="Choose a category"
                onPress={() => setCategorySheet(true)}
              />
            </Field>

            <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
              <Field label="Date" style={{ flex: 1 }} error={dateValid ? null : 'Use YYYY-MM-DD'}>
                <TextField value={date} onChangeText={setDate} autoCapitalize="none" />
              </Field>
              <Field label="Paid by" style={{ flex: 1 }}>
                <SelectField
                  value={PAYERS.find((p) => p.value === paidBy)?.label ?? null}
                  placeholder="Who paid"
                  onPress={() => setPayerSheet(true)}
                />
              </Field>
            </Row>

            {paidBy === 'FERNANDO' ? (
              <Txt variant="micro" style={{ color: Colors.info, marginTop: -Space.sm, marginBottom: Space.md }}>
                Recorded as a reimbursement owed to Fernando. It counts as investment in the car
                either way.
              </Txt>
            ) : null}

            <Field label="Description" hint="Optional">
              <TextField
                value={description}
                onChangeText={setDescription}
                placeholder="Front brake pads"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Item">
              <SelectField
                value={selectedItem?.name ?? null}
                placeholder="Choose from stock"
                onPress={() => setItemSheet(true)}
              />
            </Field>
            <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
              <Field label="Quantity" style={{ flex: 1 }}>
                <TextField
                  value={quantity}
                  onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="Date" style={{ flex: 1 }}>
                <TextField value={date} onChangeText={setDate} autoCapitalize="none" />
              </Field>
            </Row>
            {selectedItem ? (
              <View style={{ marginBottom: Space.lg }}>
                <Txt variant="small" tone="muted">
                  Charges{' '}
                  <Txt variant="small" weight="bold">
                    {formatMoney(Number(quantity || 0) * selectedItem.unitCostCents)}
                  </Txt>{' '}
                  to this vehicle.
                </Txt>
                <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                  No cash moves — you already paid for this stock when you bought it.
                </Txt>
              </View>
            ) : null}
          </>
        )}

        <Button
          label={
            mode === 'CASH' && amountCents > 0
              ? `Add ${formatMoney(amountCents)}`
              : 'Add expense'
          }
          onPress={save}
          disabled={mode === 'CASH' ? !canSaveCash : !canSaveStock}
        />
      </Sheet>

      <OptionSheet
        visible={categorySheet}
        onClose={() => setCategorySheet(false)}
        title="Category"
        options={categoryOptions}
        selected={categoryId}
        onSelect={setCategoryId}
      />
      <OptionSheet
        visible={payerSheet}
        onClose={() => setPayerSheet(false)}
        title="Who paid?"
        options={PAYERS}
        selected={paidBy}
        onSelect={setPaidBy}
      />
      <OptionSheet
        visible={itemSheet}
        onClose={() => setItemSheet(false)}
        title="Use from stock"
        options={itemOptions}
        selected={itemId}
        onSelect={setItemId}
      />
    </>
  );
}
