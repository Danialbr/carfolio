/**
 * BACKUP — the web half.
 *
 * The decisions about WHAT a backup contains and whether one is acceptable
 * live in ./bundle.ts, which is pure and fully tested, and are shared with the
 * native path unchanged. This file only moves bytes, using a download for the
 * export and a file input for the import.
 *
 * On iOS the download lands in the share sheet, where "Save to Files" puts it
 * in iCloud Drive. That is the copy that survives losing the app, so the backup
 * screen pushes hard on making it.
 */

import type { Db } from '../../db/client';
import { readSnapshot } from '../../db/repos';
import { todayISO } from '../../domain/dates';
import { computeBusinessPosition, verifyIdentity } from '../../domain/capital';
import { buildBundle, restoreBundle, validateBundle, type Bundle } from './bundle';

export interface ImportResult {
  ok: boolean;
  errors: string[];
  rollbackUri: string | null;
  counts: Record<string, number> | null;
  balanced: boolean;
}

/** What phase one produces: a file that has been read and checked, or a reason. */
export interface PickedBackup {
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
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    return { ok: true, uri: null, filename, error: null };
  } catch (error) {
    return {
      ok: false,
      uri: null,
      filename,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Keeps the pre-import state in memory under a key the backup screen can
 * mention. There is no filesystem here, so the rollback copy lives as long as
 * the tab does — which is long enough, because a rollback only ever happens
 * seconds after the import that prompted it.
 */
const rollbacks = new Map<string, string>();

export function readRollback(key: string): string | null {
  return rollbacks.get(key) ?? null;
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // A cancelled picker fires no event in some browsers; the window regaining
    // focus without a file is the only reliable signal.
    window.addEventListener(
      'focus',
      () => setTimeout(() => resolve(input.files?.[0] ?? null), 400),
      { once: true },
    );
    input.click();
  });
}

/**
 * Phase one: choose a file and check it, writing nothing. The picker opens on
 * the tap itself — no dialog in between — which is what keeps it working in
 * Safari, where a file input only opens while a user gesture is still live.
 */
export async function pickBackup(): Promise<PickedBackup> {
  const file = await pickFile();
  if (!file) return { cancelled: true, ok: false, errors: [], bundle: null, counts: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
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
  const rollbackKey = `pre-import-${Date.now()}`;
  rollbacks.set(rollbackKey, JSON.stringify(buildBundle(readSnapshot(db))));

  const restored = restoreBundle(db, bundle);
  if (!restored.ok) {
    return {
      ok: false,
      errors: [restored.error ?? 'The restore failed and nothing was changed.'],
      rollbackUri: rollbackKey,
      counts: null,
      balanced: true,
    };
  }

  const position = computeBusinessPosition(readSnapshot(db));
  return {
    ok: true,
    errors: [],
    rollbackUri: rollbackKey,
    counts: bundle.counts,
    balanced: verifyIdentity(position).ok,
  };
}
