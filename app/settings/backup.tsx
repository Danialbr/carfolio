/**
 * BACKUP & RESTORE
 *
 * The most consequential screen in the app, and written to say so. There is no
 * server: an export file is the only thing that survives a lost phone or an
 * uninstall. The copy here is direct about that rather than reassuring.
 *
 * Restoring is guarded twice — a confirmation before the file picker, and a
 * summary of what was actually written afterwards — because it replaces
 * everything.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space } from '../../theme';
import {
  Button,
  Card,
  Divider,
  Row,
  Screen,
  SectionHeader,
  Txt,
} from '../../components/ui/primitives';
import { DataRow } from '../../components/ui/money';
import { ScreenHeader } from '../../components/domain/ScreenHeader';
import { useApp } from '../../state/store';
import { applyRestore, exportBackup, pickBackup } from '../../services/backup/files';
import { confirm, notify } from '../../components/ui/dialog';
import { flush } from '../../db/persist';
import { BUNDLE_VERSION } from '../../services/backup/bundle';
import { daysBetween, formatDate, todayISO } from '../../domain/dates';

export default function Backup() {
  const db = useApp((s) => s.db);
  const snapshot = useApp((s) => s.snapshot);
  const refresh = useApp((s) => s.refresh);
  const lastExportAt = useApp((s) => s.lastExportAt);
  const setLastExportAt = useApp((s) => s.setLastExportAt);

  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const daysSince = lastExportAt == null ? null : daysBetween(lastExportAt, todayISO());
  const stale = daysSince == null || daysSince > 14;

  const totalRecords =
    snapshot.vehicles.length +
    snapshot.expenses.length +
    snapshot.sales.length +
    snapshot.capitalEvents.length +
    snapshot.distributions.length +
    snapshot.fernandoEntries.length +
    snapshot.inventory.length;

  const doExport = async () => {
    if (!db) return;
    setBusy('export');
    const result = await exportBackup(db);
    setBusy(null);

    if (!result.ok) {
      void notify('Export failed', result.error ?? 'The file could not be written.');
      return;
    }
    setLastExportAt(todayISO());
    void notify(
      'Backup created',
      `${result.filename}\n\nSave it somewhere that isn't this phone — iCloud, Drive, or email it to yourself. A backup that only exists here doesn't protect you.`,
    );
  };

  /**
   * The picker opens on the tap; the confirmation comes after, once the file
   * has been read and checked. That order is what makes this work on both
   * platforms — a dialog before the picker consumes the user gesture, and on
   * the web the picker then never opens at all. It is also better: you confirm
   * knowing exactly what is in the file you chose.
   */
  const confirmImport = async () => {
    if (!db) return;
    setBusy('import');
    const picked = await pickBackup();
    setBusy(null);

    if (picked.cancelled) return;

    if (!picked.ok || !picked.bundle) {
      await notify(
        'Nothing was restored',
        `${picked.errors.join('\n\n')}\n\nYour current data is exactly as it was.`,
      );
      return;
    }

    const contents = Object.entries(picked.counts ?? {})
      .filter(([, n]) => (n as number) > 0)
      .map(([key, n]) => `${n} ${key}`)
      .join(', ');

    const go = await confirm({
      title: 'Restore this backup?',
      message: `The file holds ${contents || 'no records'}.\n\nThis REPLACES everything currently in Carfolio. A snapshot of your current data is saved first so the restore can be undone.`,
      confirmLabel: 'Replace everything',
      destructive: true,
    });
    if (!go) return;

    setBusy('import');
    const result = await applyRestore(db, picked.bundle);
    setBusy(null);

    if (!result.ok) {
      await notify(
        'Nothing was restored',
        `${result.errors.join('\n\n')}\n\nYour current data is exactly as it was.`,
      );
      return;
    }

    refresh();
    // A restore rewrites every table without going through withRefresh, so the
    // web build is told explicitly to write the new database to storage. On the
    // phone this is a no-op.
    flush();

    const summary = Object.entries(result.counts ?? {})
      .filter(([, n]) => (n as number) > 0)
      .map(([key, n]) => `${n} ${key}`)
      .join('\n');

    await notify(
      'Restored',
      `${summary || 'An empty backup'}\n\n${
        result.balanced
          ? 'The restored books balance.'
          : 'Warning: the restored books do not balance. Check Data integrity.'
      }`,
    );
  };

  return (
    <Screen>
      <ScreenHeader title="Backup & restore" subtitle="Your data lives only on this phone" />

      {/* This is not a nag to dismiss. It is the single most important thing
          on the screen when it is true. */}
      <View style={[warningPanel, !stale && okPanel]}>
        <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
          <Ionicons
            name={stale ? 'warning' : 'checkmark-circle'}
            size={20}
            color={stale ? Colors.warn : Colors.profit}
          />
          <View style={{ flex: 1 }}>
            <Txt variant="small" weight="bold" style={{ color: stale ? Colors.warn : Colors.profit }}>
              {lastExportAt == null
                ? 'You have never exported a backup'
                : stale
                  ? `Last backup was ${daysSince} days ago`
                  : `Backed up ${formatDate(lastExportAt)}`}
            </Txt>
            <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
              {stale
                ? 'Carfolio has no server. If this phone is lost or the app is uninstalled, everything goes with it.'
                : 'Keep the file somewhere other than this phone.'}
            </Txt>
          </View>
        </Row>
      </View>

      <SectionHeader title="Export" style={{ marginTop: Space.xl }} />
      <Card style={{ marginBottom: Space.lg }}>
        <DataRow label="Vehicles" value={String(snapshot.vehicles.length)} />
        <DataRow label="Expenses" value={String(snapshot.expenses.length)} />
        <DataRow label="Sales" value={String(snapshot.sales.length)} />
        <DataRow label="Capital events" value={String(snapshot.capitalEvents.length)} />
        <DataRow label="Distributions" value={String(snapshot.distributions.length)} />
        <DataRow label="Fernando entries" value={String(snapshot.fernandoEntries.length)} />
        <DataRow label="Inventory items" value={String(snapshot.inventory.length)} />
        <Divider spacing={Space.sm} />
        <DataRow label="Total records" value={String(totalRecords)} emphasis />

        <Button
          label="Export everything"
          icon="download-outline"
          onPress={doExport}
          loading={busy === 'export'}
          style={{ marginTop: Space.lg }}
        />
        <Txt variant="micro" tone="faint" style={{ marginTop: Space.sm }}>
          Writes a single JSON file and opens the share sheet. Send it to iCloud, Drive, or your own
          email.
        </Txt>
      </Card>

      <SectionHeader title="Restore" />
      <Card style={{ marginBottom: Space.lg }}>
        <Txt variant="small" tone="muted">
          Restoring <Txt variant="small" weight="bold">replaces everything</Txt> in Carfolio with
          the contents of a backup file.
        </Txt>
        <Txt variant="micro" tone="faint" style={{ marginTop: Space.sm }}>
          A snapshot of your current data is written first, so a restore you didn&apos;t mean to do
          can be reversed. Backups made by a newer version of the app are refused rather than
          partially read.
        </Txt>
        <Button
          label="Restore from a file"
          variant="secondary"
          icon="cloud-upload-outline"
          onPress={confirmImport}
          loading={busy === 'import'}
          style={{ marginTop: Space.lg }}
        />
      </Card>

      <SectionHeader title="About the format" />
      <Card>
        <DataRow label="Backup format version" value={String(BUNDLE_VERSION)} />
        <DataRow label="File type" value="JSON" />
        <Txt variant="micro" tone="faint" style={{ marginTop: Space.sm }}>
          The file is plain, readable JSON — not an opaque database dump. If Carfolio ever stops
          working, your history is still legible in any text editor and loadable into a spreadsheet.
        </Txt>
      </Card>
    </Screen>
  );
}

const warningPanel = {
  backgroundColor: Colors.warnSoft,
  borderWidth: 1,
  borderColor: '#4A3616',
  borderRadius: Radius.lg,
  padding: Space.lg,
};

const okPanel = {
  backgroundColor: Colors.profitSoft,
  borderColor: '#1B5148',
};
