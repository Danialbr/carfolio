/**
 * Builds the installable web app.
 *
 * `expo export --platform web` with output "single" produces a plain SPA shell
 * and ignores app/+html.tsx (that hook only runs for static rendering), so the
 * things that turn a page into an installed, offline app are injected here:
 * the manifest, the Apple home-screen tags, the service-worker registration and
 * a black ground so the launch has no white flash.
 *
 * Post-processing rather than a custom template because the shell Expo emits
 * carries the hashed bundle name and the react-native-web reset, both of which
 * are its business to decide and not worth reimplementing to add six tags.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Where the app is served from. GitHub Pages puts it under a folder, not the
// root, so every absolute path has to carry it. Set in app.json experiments.baseUrl.
const BASE = (JSON.parse(readFileSync('app.json', 'utf8')).expo.experiments?.baseUrl ?? '').replace(/\/$/, '');

const OUT = 'dist/index.html';

execSync('npx expo export --platform web --clear', { stdio: 'inherit' });

if (!existsSync(OUT)) throw new Error('The export produced no dist/index.html.');

const HEAD = `
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <meta name="description" content="Private vehicle investment portfolio." />
    <link rel="manifest" href="${BASE}/manifest.json" />
    <meta name="theme-color" content="#000000" />
    <meta name="color-scheme" content="dark" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Carfolio" />
    <link rel="apple-touch-icon" href="${BASE}/apple-touch-icon.png" />
    <style>
      html, body, #root { background-color: #000000; color-scheme: dark; }
      /*
       * The safe area, handled here rather than in the app.
       *
       * Installed on an iPhone with a black-translucent status bar, the page
       * owns the whole screen — including the strip under the clock and the
       * strip over the home indicator. react-native-safe-area-context reports
       * zero insets on web, so nothing inside React knows to avoid them and the
       * first line of every screen ends up behind the clock.
       *
       * Padding the body with the real env() values fixes it once, for every
       * screen, without a single platform branch in the app.
       */
      body {
        margin: 0;
        box-sizing: border-box;
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
        overscroll-behavior: none;
        -webkit-tap-highlight-color: transparent;
      }
      /* Selection is a nuisance on a dashboard, and wanted in the fields where
         a number is actually being edited. */
      * { -webkit-user-select: none; user-select: none; }
      input, textarea { -webkit-user-select: text; user-select: text; }
    </style>
    <style>
      .az-rocket{position:fixed;top:calc(env(safe-area-inset-top) + 10px);right:12px;z-index:9999;width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(14,19,28,.85);border:1px solid rgba(200,170,110,.5);color:#C8AA6E;text-decoration:none;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
      .az-rocket svg{width:20px;height:20px}
    </style>
    <script>
      // Arizona Industries: a rocket back to the 3D world. Only inside Orbit's app.
      if (location.pathname.indexOf('/Orbit/') === 0) {
        document.addEventListener('DOMContentLoaded', function () {
          var a = document.createElement('a');
          a.className = 'az-rocket'; a.href = '${BASE.replace(/\/carfolio$/, '')}/arizona/'; a.setAttribute('aria-label', 'Arizona Industries');
          a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c3 2.5 4.5 6 4.5 10.5L14 16h-4l-2.5-3.5C7.5 8 9 4.5 12 2z"/><circle cx="12" cy="9" r="1.6"/><path d="M10 16l-1 5 3-2 3 2-1-5"/><path d="M7.5 12.5L4.5 15l3 1M16.5 12.5l3 2.5-3 1"/></svg>';
          document.body.appendChild(a);
        });
      }
    </script>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('${BASE}/sw.js', { scope: '${BASE}/' }).catch(function () {});
        });
      }
    </script>
`;

let html = readFileSync(OUT, 'utf8');

// Expo's own viewport tag has no viewport-fit=cover, which is what keeps the
// app off the very edges of the screen once installed.
html = html.replace(/\n\s*<meta name="viewport"[^>]*\/>/, '');
html = html.replace('</head>', `${HEAD}  </head>`);

writeFileSync(OUT, html);
// GitHub Pages answers unknown paths (a reload on /vehicle/123) with 404.html.
writeFileSync('dist/404.html', html);
console.log('dist/index.html: installable shell written');
