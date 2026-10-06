/**
 * IS A BACKUP OVERDUE?
 *
 * Pure, so the rule can be argued with in a test rather than discovered on the
 * phone. The rule matters more on the web build than the native one: there the
 * database lives in browser storage, which the person can wipe by deleting the
 * home-screen icon, and which no iCloud device backup covers. An export to
 * Files is the only copy that survives that, so the app has to ask for one.
 *
 * The prompt is driven by WORK DONE, not by the calendar alone. Nagging every
 * seven days regardless of activity trains people to dismiss it; asking right
 * after a sale — when there is something real to lose — does not.
 */

import { daysBetween } from './dates';
import type { ISODate } from './dates';
// The same shape the capital model already takes. domain/ never imports from
// db/, so the store passes its snapshot in rather than this file reaching for
// one.
import type { BusinessInput } from './capital';

export type BackupUrgency = 'NONE' | 'SUGGESTED' | 'OVERDUE';

export interface BackupStatus {
  /** Whether a backup has ever been taken. */
  everBackedUp: boolean;
  /** Days since the last export, or null if there has never been one. */
  daysSince: number | null;
  /** Records created since the last export. Zero means nothing is at risk. */
  unsavedChanges: number;
  urgency: BackupUrgency;
  /** One sentence, ready to print. Null when nothing needs saying. */
  message: string | null;
}

const SUGGEST_AFTER_DAYS = 7;
const OVERDUE_AFTER_DAYS = 30;

/** Every dated record a backup would protect. */
function countRecordsSince(snapshot: BusinessInput, since: ISODate | null): number {
  const after = (date: ISODate) => since == null || date > since;
  return (
    snapshot.vehicles.filter((v) => after(v.purchaseDate)).length +
    snapshot.sales.filter((s) => after(s.saleDate)).length +
    snapshot.expenses.filter((e) => after(e.date)).length +
    snapshot.capitalEvents.filter((c) => after(c.date)).length
  );
}

export function backupStatus(
  lastBackupAt: ISODate | null,
  snapshot: BusinessInput,
  today: ISODate,
): BackupStatus {
  const hasData =
    snapshot.vehicles.length > 0 ||
    snapshot.capitalEvents.length > 0 ||
    snapshot.expenses.length > 0;

  // Nothing to lose yet. An empty app asking to be backed up is noise.
  if (!hasData) {
    return {
      everBackedUp: lastBackupAt != null,
      daysSince: lastBackupAt ? daysBetween(lastBackupAt, today) : null,
      unsavedChanges: 0,
      urgency: 'NONE',
      message: null,
    };
  }

  const unsavedChanges = countRecordsSince(snapshot, lastBackupAt);
  const daysSince = lastBackupAt ? daysBetween(lastBackupAt, today) : null;

  if (lastBackupAt == null) {
    return {
      everBackedUp: false,
      daysSince: null,
      unsavedChanges,
      urgency: 'OVERDUE',
      message:
        'You have never saved a backup. Everything here lives on this device only.',
    };
  }

  if (unsavedChanges === 0) {
    return { everBackedUp: true, daysSince, unsavedChanges: 0, urgency: 'NONE', message: null };
  }

  const plural = unsavedChanges === 1 ? 'record' : 'records';
  const age = daysSince ?? 0;

  if (age >= OVERDUE_AFTER_DAYS) {
    return {
      everBackedUp: true,
      daysSince,
      unsavedChanges,
      urgency: 'OVERDUE',
      message: `${unsavedChanges} ${plural} added since your last backup, ${age} days ago.`,
    };
  }

  if (age >= SUGGEST_AFTER_DAYS || unsavedChanges >= 5) {
    return {
      everBackedUp: true,
      daysSince,
      unsavedChanges,
      urgency: 'SUGGESTED',
      message: `${unsavedChanges} ${plural} added since your last backup.`,
    };
  }

  return { everBackedUp: true, daysSince, unsavedChanges, urgency: 'NONE', message: null };
}
