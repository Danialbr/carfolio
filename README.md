# Carfolio

A private, offline-first vehicle investment and car-flipping portfolio manager.
One user, one device, no server, no accounts.

```bash
npm install
npx expo start        # scan the QR code with Expo Go
```

Requires Node 20.19.4+ (LTS recommended) and the Expo Go app.

---

## What it does

Tracks the full life of a flip:

```
VEHICLE → PURCHASE → INVESTMENT BREAKDOWN → TOTAL INVESTED
        → SALE → GROSS PROFIT/LOSS → PROFIT ALLOCATION
```

Purchase price and additional investment are kept visibly separate everywhere,
and every total is derived — you never calculate anything yourself.

**Two kinds of vehicle.** `MYSELF` (100% yours) and `ASSOCIATED` (50/50 with
Fernando, wins and losses alike). That is the only partnership distinction, and
there is no partner-management system to maintain.

**Your capital is protected.** Principal is tracked separately from profit and
is never moved by a sale, a distribution, or reinvestment. The app makes that
distinction visually obvious.

**Screens.** Dashboard · Garage · Vehicles/History · Capital · Fernando ·
Inventory · Analytics · Year-to-date · Reports · Backup.

**PDF reports.** A full per-vehicle statement and a business summary, both
professional enough to send to Fernando directly.

---

## Your data

Everything lives in a SQLite database on this phone. There is no server and no
sync, which means an **export is the only thing that survives a lost phone or an
uninstall.** The app tells you when your last backup is more than two weeks old.

Backups are plain, readable JSON — if Carfolio ever stops working, your history
is still legible in a text editor.

Fernando can run this same project through Expo Go on his own phone. Storage is
per-device, so his copy is completely independent and cannot touch your data.

---

## Development

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint, zero warnings tolerated
npm run db:generate   # regenerate migrations after a schema change

npm run test:setup    # one-time: installs the test-only database driver
npm test              # 202 tests
```

`better-sqlite3` (the test-only driver) is **not** a normal dependency. It is a
native module that needs a C++ compiler to build, and requiring one just to run
the app would be absurd. `npm run test:setup` installs it when you actually want
to run the suite.

See **[DEVELOPMENT.md](./DEVELOPMENT.md)** for the architecture, the data model,
every financial rule and formula, the storage and PDF strategies, the testing
approach, and the decisions made along the way.

---

## Dónde vive (web)

La versión web se publica **dentro de Orbit**: `https://danialbr.github.io/Orbit/carfolio/`.
Así Orbit, Carfolio y Arizona Industries comparten el mismo almacenamiento en el iPhone
y Arizona puede mostrar los carros y ventas reales.

```bash
npm install
npm run build:web          # usa experiments.baseUrl = /Orbit/carfolio (app.json)
# copiar dist/ a la carpeta carfolio/ del repo Orbit
```

Cada vez que guarda, Carfolio escribe un resumen pequeño (`carfolio.world` en localStorage:
carros, estado, costos, ventas — sin VIN ni compradores) que Arizona lee.

`scout/main.js` es el Actor de Apify (Carfolio Scout). El token de Telegram va como secreto
en Apify, nunca en este repo.
