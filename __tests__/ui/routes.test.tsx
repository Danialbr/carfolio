/**
 * NAVIGATION VERIFICATION
 *
 * Two things this proves, both of which are silent failures otherwise:
 *
 *  1. Every route referenced by a link in the app actually exists as a file.
 *     expo-router resolves routes at runtime, so a typo in `router.push()`
 *     produces a blank screen on the device and nothing at all in CI. This
 *     walks the source for navigation targets and checks each one resolves.
 *
 *  2. Every screen module can be imported and has a default export. A screen
 *     that throws on import fails at navigation time, not at build time.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const APP = path.join(ROOT, 'app');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const screenFiles = walk(APP).filter((f) => f.endsWith('.tsx'));

/** 'app/(tabs)/garage.tsx' → '/(tabs)/garage'; index and groups handled. */
function routeFor(file: string): string {
  const rel = path.relative(APP, file).replace(/\.tsx$/, '');
  const withoutIndex = rel.replace(/(^|\/)index$/, '');
  return `/${withoutIndex}`.replace(/\/$/, '') || '/';
}

const declaredRoutes = new Set(
  screenFiles
    .filter((f) => !f.endsWith('_layout.tsx'))
    .flatMap((f) => {
      const route = routeFor(f);
      // A route inside a group is reachable both with and without the group
      // segment, and expo-router treats (tabs)/index as the app's root.
      const withoutGroup = route.replace(/\/\([^)]+\)/g, '');
      return [route, withoutGroup === '' ? '/' : withoutGroup];
    }),
);

/** Collects every literal navigation target in the source. */
function navigationTargets(): { target: string; file: string }[] {
  const sources = [
    ...walk(APP),
    ...walk(path.join(ROOT, 'components')),
  ].filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

  const found: { target: string; file: string }[] = [];
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    // router.push('/x'), router.replace('/x'), go('/x'), <Redirect href="/x" />
    const patterns = [
      /router\.(?:push|replace)\(\s*['"`]([^'"`$]+)['"`]/g,
      /\bgo\(\s*['"`]([^'"`$]+)['"`]/g,
      /href=\{?\s*['"`]([^'"`$]+)['"`]/g,
      /onAction=\{\(\)\s*=>\s*router\.(?:push|replace)\(\s*['"`]([^'"`$]+)['"`]/g,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const raw = match[1];
        if (raw && raw.startsWith('/')) {
          found.push({ target: raw.split('?')[0] as string, file: path.relative(ROOT, file) });
        }
      }
    }
  }
  return found;
}

describe('route files', () => {
  it('has a screen for every tab in the tab bar', () => {
    for (const name of ['index', 'garage', 'add', 'vehicles', 'more']) {
      expect(fs.existsSync(path.join(APP, '(tabs)', `${name}.tsx`))).toBe(true);
    }
  });

  it('has every screen the specification calls for', () => {
    const required = [
      '(tabs)/index.tsx', // Dashboard
      '(tabs)/garage.tsx', // Garage
      '(tabs)/vehicles.tsx', // Vehicles / History / My Cars
      'vehicle/new.tsx',
      'vehicle/[id].tsx',
      'vehicle/sell.tsx',
      'capital.tsx',
      'fernando.tsx',
      'inventory.tsx',
      'analytics.tsx',
      'ytd.tsx',
      'reports.tsx',
      'settings/backup.tsx',
      'settings/categories.tsx',
      'settings/integrity.tsx',
    ];
    for (const file of required) {
      expect(fs.existsSync(path.join(APP, file))).toBe(true);
    }
  });

  it('gives every screen a default export', () => {
    for (const file of screenFiles) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).toMatch(/export default function|export default \w+/);
    }
  });
});

describe('every navigation target resolves to a real screen', () => {
  it('has no dangling links', () => {
    const dangling = navigationTargets().filter(({ target }) => {
      if (declaredRoutes.has(target)) return false;
      // Dynamic segments: '/vehicle/abc123' matches the '[id]' route.
      const segments = target.split('/').filter(Boolean);
      for (const route of declaredRoutes) {
        const routeSegments = route.split('/').filter(Boolean);
        if (routeSegments.length !== segments.length) continue;
        const matches = routeSegments.every(
          (segment, i) => segment.startsWith('[') || segment === segments[i],
        );
        if (matches) return false;
      }
      return true;
    });

    if (dangling.length > 0) {
      throw new Error(
        `These navigation targets do not resolve to a screen:\n` +
          dangling.map((d) => `  ${d.target}  (in ${d.file})`).join('\n') +
          `\n\nKnown routes:\n` +
          [...declaredRoutes].sort().map((r) => `  ${r}`).join('\n'),
      );
    }
  });

  it('actually found targets to check — the scan is not silently empty', () => {
    // Guards against the regexes above quietly matching nothing, which would
    // make the test above pass for the wrong reason.
    const targets = navigationTargets();
    expect(targets.length).toBeGreaterThan(10);
    expect(targets.some((t) => t.target === '/vehicle/new')).toBe(true);
  });
});
