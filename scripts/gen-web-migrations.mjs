/**
 * Turns the generated drizzle SQL into a TypeScript module the web build can
 * import.
 *
 * Native uses drizzle's expo-sqlite migrator, which reads the .sql files
 * through a Metro transformer. The web build has no such transformer, so the
 * same statements are emitted here as a plain string array. Generated, never
 * hand-edited: `npm run db:web` after every `drizzle-kit generate`, or the two
 * platforms silently drift apart.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'drizzle';
const OUT = 'db/webMigrations.ts';

const journal = JSON.parse(readFileSync(join(DIR, 'meta', '_journal.json'), 'utf8'));
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const groups = files.map((file) => {
  const sql = readFileSync(join(DIR, file), 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
  return { file, statements };
});

const body = `/**
 * GENERATED — do not edit. Run \`npm run db:web\` instead.
 *
 * The same migrations the native app applies through drizzle's expo-sqlite
 * migrator, as plain SQL for the web build. Keeping one source (drizzle/*.sql)
 * is what stops the two platforms drifting into different schemas.
 */

export const WEB_MIGRATIONS: readonly { readonly tag: string; readonly statements: readonly string[] }[] = [
${groups
  .map(
    (g, i) =>
      `  {\n    tag: ${JSON.stringify(journal.entries[i]?.tag ?? g.file.replace(/\.sql$/, ''))},\n    statements: [\n${g.statements
        .map((s) => `      ${JSON.stringify(s)},`)
        .join('\n')}\n    ],\n  },`,
  )
  .join('\n')}
];
`;

writeFileSync(OUT, body);
console.log(`${OUT}: ${groups.length} migration(s), ${groups.reduce((n, g) => n + g.statements.length, 0)} statements`);
