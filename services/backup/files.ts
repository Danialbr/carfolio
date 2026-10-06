/**
 * BACKUP — the device half: writing the file out and reading one back in.
 *
 * All of the decisions about WHAT a backup contains and whether one is
 * acceptable live in ./bundle.ts, which is pure and fully tested. This file
 * only moves bytes.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import type { Db } from '../../db/client';
import { readSnapshot } from '../../db/repos';
import { todayISO } from '../../domain/dates';
import { computeBusinessPosition, verifyIdentity } from '../../domain/capital';
import { buildBundle, restoreBundle, validateBundle, type Bundle } from './bundle';

export interface ImportResult {
  ok: boolean;
  errors: string[];
  /** The pre-import state, written to disk so the import can be undone. */
  rollbackUri: string | null;
  counts: Record<string, number> | null;
  /** Whether the restored data balances. A backup of broken books is still broken. */
  balanced: boolean;
}

/** What phase one produces: a file that has been read and checked, or a reason. */
export interface PickedBackup {
  /** The picker was dismissed. Not an error — say nothing. */
  cancelled: boolean;
  ok: boolean;
  errors: string[];
  bundle: Bundle | null;
  counts: Record<string, number> | null;
}

export interface ExportResult {
  ok: boolean;
  uri: string | null;
  filename: string;
  error: string | null;
}

export async function exportBackup(db: Db): Promise<ExportResult> {
  const filename = `carfolio-backup-${todayISO()}.json`;
  try {
    const bundle = buildBundle(readSnapshot(db));
    // Written to the cache directory: this is a transient hand-off file, not
    // something the app needs to keep. The copy that matters is wherever the
    // user saves it.
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(bundle, null, 2));

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: 'Save your Carfolio backup',
        UTI: 'public.json',
      });
    }
    return { ok: true, uri, filename, error: null };
  } catch (error) {
    return {
      ok: false,
      uri: null,
      filename,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}


/** Writes the current state to a file so a mistaken import can be reversed. */

async function writeRollbackSnapshot(db: Db): Promise<string | null> {
  try {
    const uri = `${FileSystem.documentDirectory}carfolio-pre-import-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(buildBundle(readSnapshot(db))));
    return uri;
  } catch {
    return null;
  }
}

/**
 * Phase one: choose a file and check it. Nothing is written, so this is safe to
 * call before the user has confirmed anything — which is the point. The picker
 * opens on the tap, the confirmation comes afterwards with the file's contents
 * already known, and no dialog has to sit between a gesture and the picker.
 */
export async function pickBackup(): Promise<PickedBackup> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json', '*/*'],
    copyToCacheDirectory: true,
  });

  if (picked.canceled || !picked.assets?.[0]) {
    return { cancelled: true, ok: false, errors: [], bundle: null, counts: null };
  }

  let parsed: unknown;
  try {
    const text = await FileSystem.readAsStringAsync(picked.assets[0].uri);
    parsed = JSON.parse(text);
  } catch {
    return {
      cancelled: false,
      ok: false,
      errors: ['That file could not be read as a Carfolio backup.'],
      bundle: null,
      counts: null,
    };
  }

  const validation = validateBundle(parsed);
  if (!validation.ok || !validation.bundle) {
    return { cancelled: false, ok: false, errors: validation.errors, bundle: null, counts: null };
  }

  return {
    cancelled: false,
    ok: true,
    errors: [],
    bundle: validation.bundle,
    counts: validation.bundle.counts,
  };
}

/** Phase two: replace everything. Only called after the user has confirmed. */
export async function applyRestore(db: Db, bundle: Bundle): Promise<ImportResult> {
  const rollbackUri = await writeRollbackSnapshot(db);

  const restored = restoreBundle(db, bundle);
  if (!restored.ok) {
    return {
      ok: false,
      errors: [restored.error ?? 'The restore failed and nothing was changed.'],
      rollbackUri,
      counts: null,
      balanced: true,
    };
  }

  const position = computeBusinessPosition(readSnapshot(db));
  return {
    ok: true,
    errors: [],
    rollbackUri,
    counts: bundle.counts,
    balanced: verifyIdentity(position).ok,
  };
}
