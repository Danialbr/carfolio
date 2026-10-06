/**
 * INVENTORY — bulk supplies, kept deliberately simple.
 *
 * The specification is explicit that inventory must not compromise the core
 * vehicle workflow, so this is a flat list with one action. There are no
 * reorder points, no suppliers table and no stock-take: buying a case of oil
 * and using two bottles on a car is the whole feature.
 *
 * The accounting rule that makes it safe: cash leaves when stock is BOUGHT.
 * Drawing stock onto a vehicle moves cost from the shelf to the car without
 * spending anything again. Without that distinction the same dollar would be
 * counted twice, once as a supply purchase and once as a vehicle expense.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Space } from '../theme';
import {
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
import { addInventoryItem } from '../db/operations';
import { formatMoney, sumCents, type Cents } from '../domain/money';
import { formatShortDate, isValidISODate, todayISO } from '../domain/dates';

export default function Inventory() {
  const items = useApp((s) => s.snapshot.inventory);
  const expenses = useApp((s) => s.snapshot.expenses);
  const position = useApp((s) => s.position);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCents, setUnitCents] = useState<Cents>(0);
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [supplier, setSupplier] = useState('');

  const qty = Number(quantity || 0);
  const lotCost = qty * unitCents;
  const dateValid = isValidISODate(purchaseDate);
  const canSave = name.trim() !== '' && Number.isInteger(qty) && qty > 0 && dateValid;

  const close = () => {
    setAdding(false);
    setName('');
    setCategory('');
    setQuantity('');
    setUnitCents(0);
    setSupplier('');
    setPurchaseDate(todayISO());
  };

  const save = () => {
    if (!canSave) return;
    const result = withRefresh((db) =>
      addInventoryItem(db, {
        name,
        category: category.trim(),
        quantity: qty,
        unitCostCents: unitCents,
        purchaseDate,
        supplier: supplier.trim(),
        notes: '',
      }),
    );
    if (result && !result.ok) {
      void notify('Could not add item', result.errors.join('\n'));
      return;
    }
    close();
  };

  /** Value already drawn out of a lot — its complement is what remains. */
  const drawnFor = (itemId: string) =>
    sumCents(
      expenses
        .filter((e) => e.inventoryItemId === itemId && e.deletedAt == null)
        .map((e) => e.amountCents),
    );

  return (
    <>
      <Screen>
        <ScreenHeader title="Inventory" subtitle="Supplies bought in bulk" />

        <Card style={{ marginBottom: Space.lg }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt variant="micro" tone="faint">
                VALUE ON THE SHELF
              </Txt>
              <Money
                cents={position.inventoryValueCents}
                variant="title"
                weight="extrabold"
                style={{ marginTop: 4 }}
              />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt variant="micro" tone="faint">
                ITEMS
              </Txt>
              <Txt variant="title" weight="extrabold" numeric style={{ marginTop: 4 }}>
                {items.length}
              </Txt>
            </View>
          </Row>
          <Divider spacing={Space.md} />
          <Row gap={6} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="information-circle-outline" size={13} color={Colors.text2} style={{ marginTop: 4 }} />
            <Txt variant="micro" tone="faint" style={{ flex: 1 }}>
              Cash leaves when you buy stock. Using it on a vehicle moves the cost onto that car
              without spending anything again.
            </Txt>
          </Row>
        </Card>

        <Button
          label="Add stock"
          icon="add-circle-outline"
          onPress={() => setAdding(true)}
          style={{ marginBottom: Space.xl }}
        />

        <SectionHeader title="In stock" />
        {items.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title="No supplies yet"
            body="Add things you buy in bulk — oil, filters, microfibre, brake cleaner — and assign them to vehicles as you use them."
            actionLabel="Add stock"
            onAction={() => setAdding(true)}
          />
        ) : (
          <View style={{ gap: Space.sm }}>
            {items.map((item) => {
              const drawn = drawnFor(item.id);
              const remainingValue = item.purchaseCostCents - drawn;
              const usedUp = item.quantity === 0;

              return (
                <Card key={item.id} style={usedUp ? { opacity: 0.6 } : undefined}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, paddingRight: Space.sm }}>
                      <Txt variant="body" weight="bold">
                        {item.name}
                      </Txt>
                      <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                        {item.category ? `${item.category} · ` : ''}
                        bought {formatShortDate(item.purchaseDate)}
                        {item.supplier ? ` · ${item.supplier}` : ''}
                      </Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt variant="heading" weight="extrabold" numeric>
                        {item.quantity}
                      </Txt>
                      <Txt variant="micro" tone="faint">
                        left
                      </Txt>
                    </View>
                  </Row>

                  <Divider spacing={Space.sm} />

                  <DataRow
                    label="Unit cost"
                    valueNode={<Money cents={item.unitCostCents} variant="small" showCents />}
                  />
                  <DataRow
                    label="Lot cost"
                    valueNode={<Money cents={item.purchaseCostCents} variant="small" />}
                  />
                  <DataRow
                    label="Used on vehicles"
                    valueNode={<Money cents={drawn} variant="small" tone="muted" />}
                  />
                  <DataRow
                    label="Remaining value"
                    valueNode={<Money cents={remainingValue} variant="small" />}
                    emphasis
                  />

                  {usedUp ? (
                    <Txt variant="micro" tone="faint" style={{ marginTop: Space.sm }}>
                      Used up. Kept for history.
                    </Txt>
                  ) : (
                    <Txt variant="micro" tone="faint" style={{ marginTop: Space.sm }}>
                      Use this on a vehicle from that vehicle&apos;s Add expense sheet.
                    </Txt>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </Screen>

      <Sheet
        visible={adding}
        onClose={close}
        title="Add stock"
        subtitle="Something you bought in bulk to use across vehicles"
      >
        <Field label="Item">
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="Motor oil 5W-30"
            autoFocus
            autoCapitalize="sentences"
          />
        </Field>
        <Field label="Category" hint="Optional">
          <TextField value={category} onChangeText={setCategory} placeholder="Fluids" />
        </Field>
        <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
          <Field label="Quantity" style={{ flex: 1 }}>
            <TextField
              value={quantity}
              onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ''))}
              placeholder="12"
              keyboardType="number-pad"
            />
          </Field>
          <Field label="Unit cost" style={{ flex: 1 }}>
            <MoneyField cents={unitCents} onChange={setUnitCents} />
          </Field>
        </Row>
        <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
          <Field label="Purchase date" style={{ flex: 1 }} error={dateValid ? null : 'Use YYYY-MM-DD'}>
            <TextField value={purchaseDate} onChangeText={setPurchaseDate} autoCapitalize="none" />
          </Field>
          <Field label="Supplier" style={{ flex: 1 }} hint="Optional">
            <TextField value={supplier} onChangeText={setSupplier} placeholder="NAPA" />
          </Field>
        </Row>

        {lotCost > 0 ? (
          <Txt variant="small" tone="muted" style={{ marginBottom: Space.lg }}>
            Total lot cost{' '}
            <Txt variant="small" weight="bold">
              {formatMoney(lotCost)}
            </Txt>{' '}
            — this leaves your cash now.
          </Txt>
        ) : null}

        <Button
          label={lotCost > 0 ? `Add · ${formatMoney(lotCost)}` : 'Add stock'}
          onPress={save}
          disabled={!canSave}
        />
      </Sheet>
    </>
  );
}
