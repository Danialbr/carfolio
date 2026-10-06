/**
 * EXPENSE CATEGORIES
 *
 * The seeded list covers everything in the specification and cannot be edited —
 * historical expenses reference these ids, and renaming one would silently
 * relabel the past. Custom categories sit alongside them and can be archived.
 *
 * Archiving, never deleting: an expense stores a category id, not a foreign
 * key, so a hard delete would leave old records labelled with a bare id.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Space } from '../../theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  Row,
  Screen,
  SectionHeader,
  Txt,
} from '../../components/ui/primitives';
import { Field, SelectField, TextField } from '../../components/ui/money';
import { OptionSheet, Sheet, type Option } from '../../components/ui/Sheet';
import { ScreenHeader } from '../../components/domain/ScreenHeader';
import { confirm, notify } from '../../components/ui/dialog';
import { useApp, withRefresh } from '../../state/store';
import {
  archiveCustomCategory,
  insertCustomCategory,
  listCustomCategories,
  type CustomCategoryRow,
} from '../../db/repos';
import {
  DEFAULT_CATEGORIES,
  GROUP_LABELS,
  GROUP_ORDER,
  type CategoryGroup,
} from '../../domain/categories';
import { newId } from '../../db/ids';

const GROUP_OPTIONS: readonly Option<CategoryGroup>[] = GROUP_ORDER.map((g) => ({
  value: g,
  label: GROUP_LABELS[g],
}));

export default function Categories() {
  const db = useApp((s) => s.db);

  /**
   * Custom categories change rarely, so they are read here rather than being
   * added to the snapshot every other screen depends on.
   *
   * Read once in a lazy initializer, not in an effect: the read is synchronous,
   * and the boot sequence guarantees the database is open before any screen
   * renders. An effect would render an empty list first and then replace it.
   */
  const [custom, setCustom] = useState<CustomCategoryRow[]>(() =>
    db ? listCustomCategories(db) : [],
  );
  const reload = () => setCustom(db ? listCustomCategories(db) : []);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState<CategoryGroup>('OTHER');
  const [groupSheet, setGroupSheet] = useState(false);

  const close = () => {
    setAdding(false);
    setLabel('');
    setGroup('OTHER');
  };

  const save = () => {
    const trimmed = label.trim();
    if (trimmed === '') return;

    const clash = [...DEFAULT_CATEGORIES, ...custom].some(
      (c) => c.label.toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) {
      void notify('Already exists', `There is already a "${trimmed}" category.`);
      return;
    }

    withRefresh((database) =>
      insertCustomCategory(database, { id: newId(), label: trimmed, group }),
    );
    reload();
    close();
  };

  const confirmArchive = async (id: string, name: string) => {
    const go = await confirm({
      title: 'Archive this category?',
      message: `"${name}" will stop appearing when you add an expense. Past expenses using it keep their label.`,
      confirmLabel: 'Archive',
      destructive: true,
    });
    if (!go) return;
    withRefresh((database) => archiveCustomCategory(database, id));
    reload();
  };

  return (
    <>
      <Screen>
        <ScreenHeader
          title="Expense categories"
          subtitle={`${DEFAULT_CATEGORIES.length} built in · ${custom.length} of your own`}
        />

        <Button
          label="Add a category"
          icon="add-circle-outline"
          onPress={() => setAdding(true)}
          style={{ marginBottom: Space.xl }}
        />

        {custom.length > 0 ? (
          <>
            <SectionHeader title="Your categories" />
            <Card style={{ marginBottom: Space.lg }}>
              {custom.map((c, index) => (
                <View key={c.id}>
                  {index > 0 ? <Divider spacing={Space.xs} /> : null}
                  <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" weight="semibold">
                        {c.label}
                      </Txt>
                      <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                        {GROUP_LABELS[c.group as CategoryGroup] ?? c.group}
                      </Txt>
                    </View>
                    <Ionicons
                      name="archive-outline"
                      size={17}
                      color={Colors.text2}
                      onPress={() => confirmArchive(c.id, c.label)}
                    />
                  </Row>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <SectionHeader title="Built in" />
        {GROUP_ORDER.map((g) => {
          const inGroup = DEFAULT_CATEGORIES.filter((c) => c.group === g);
          if (inGroup.length === 0) return null;
          return (
            <Card key={g} style={{ marginBottom: Space.sm }}>
              <Txt variant="micro" tone="faint" style={{ marginBottom: Space.sm }}>
                {GROUP_LABELS[g].toUpperCase()}
              </Txt>
              <Row style={{ flexWrap: 'wrap' }} gap={Space.xs}>
                {inGroup.map((c) => (
                  <Badge
                    key={c.id}
                    label={c.label}
                    tone={c.isPurchase ? 'brand' : 'neutral'}
                    style={{ marginBottom: Space.xs }}
                  />
                ))}
              </Row>
            </Card>
          );
        })}

        <Card style={{ marginTop: Space.md }}>
          <Row gap={6} style={{ alignItems: 'flex-start' }}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={Colors.text2}
              style={{ marginTop: 4 }}
            />
            <Txt variant="micro" tone="faint" style={{ flex: 1 }}>
              Purchase Price is highlighted because it is handled separately everywhere in the app.
              It is set when you add a vehicle, never as an ordinary expense, so a car can never end
              up with two purchase prices.
            </Txt>
          </Row>
        </Card>
      </Screen>

      <Sheet visible={adding} onClose={close} title="New category">
        <Field label="Name">
          <TextField
            value={label}
            onChangeText={setLabel}
            placeholder="Window tint"
            autoFocus
            autoCapitalize="words"
          />
        </Field>
        <Field label="Group" hint="Decides where it appears in the picker">
          <SelectField
            value={GROUP_LABELS[group]}
            placeholder="Choose a group"
            onPress={() => setGroupSheet(true)}
          />
        </Field>
        <Button label="Add category" onPress={save} disabled={label.trim() === ''} />
      </Sheet>

      <OptionSheet
        visible={groupSheet}
        onClose={() => setGroupSheet(false)}
        title="Group"
        options={GROUP_OPTIONS}
        selected={group}
        onSelect={setGroup}
      />
    </>
  );
}
