// ─────────────────────────────────────────────────────────────────────────────
// CARFOLIO SCOUT v2
//
// Runs every 15 minutes inside Apify. Each run:
//   1. pulls only NEW cars from the last 24 h, ~70 mi around Peoria, $500–$10k
//      (logged out, no Facebook account involved);
//   2. throws out what fails the rules: wrong make, salvage/rebuilt, not
//      running, engine or transmission trouble, dealers;
//   3. for each survivor, searches 5–10 comparables of the same model ±2 years,
//      adjusts them for mileage and computes market value, ARV, repairs, profit,
//      max offer and a buy score;
//   4. sends to Telegram ONLY the ones that clear $500 of profit.
//
// Input { "backfill": true } runs one wider sweep over the last 10 days, for
// the first run. The only secret is TELEGRAM_TOKEN, set on the Actor.
// ─────────────────────────────────────────────────────────────────────────────

import { Actor, log } from 'apify';

// ─────────────────────────────────────────────────────────────────────────────
// CARFOLIO SCOUT — the rules.
//
// Pure functions, no network. Every decision about which car reaches Daniel's
// phone lives here, so it can be tested against real listings before anything
// is scheduled.
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  makes: ['toyota', 'nissan', 'mazda', 'hyundai', 'kia', 'honda', 'ford', 'chevrolet', 'jeep'],
  minPrice: 500,
  maxPrice: 10000,
  maxAgeDays: 10,
  minYear: 2008,  // older than this is rarely a flip under $10k worth the time
  radiusKm: 113, // ~70 mi in a straight line ≈ 1h20 driving from 61615
};

// Honda is the only one of these makes that also builds motorcycles, ATVs and
// mowers — half of what comes back under "Honda" is not a car. So Honda is
// matched against its car models; the others pass on make alone.
const HONDA_CARS = [
  'civic', 'accord', 'cr-v', 'crv', 'hr-v', 'hrv', 'pilot', 'odyssey', 'fit',
  'element', 'insight', 'ridgeline', 'passport', 'crosstour', 'del sol',
  'prelude', 's2000', 'cr-z', 'crz', 'clarity',
];

// Anything here means the car is not a flip: no title, not moving, or a repair
// that is not a weekend job. Read from the description, because the title
// field is usually empty — "rebuilt" almost always appears only in the text,
// and often misspelled ("rebulit" was in the very first test run).
const DEAL_BREAKERS = [
  /\bsalvage[d]?\b/, /\breb(u|i)(l|i)(i|l)?[dt]\b/, /\bbranded title\b/, /\brebuildable\b/, /\bflood/, /\btotal(ed|led)\b/, /\btotal loss\b/,
  /\bparts only\b/, /\bfor parts\b/, /\bparts car\b/, /\bjunk\b/, /\bscrap\b/,
  /\bno title\b/, /\bbill of sale only\b/, /\blost title\b/,
  /\bdoes ?n[o']t run\b/, /\bnot running\b/, /\bdoesn'?t start\b/, /\bwon'?t start\b/,
  /\bno start\b/, /\bwont (start|run|crank)\b/, /\bnon[- ]?running\b/,
  /\bblown (engine|motor|head ?gasket|trans)/, /\bthrew a rod\b/, /\bseized\b/,
  /\bbad (engine|motor|transmission|trans)\b/,
  /\bneeds (a )?(new )?(engine|motor|transmission|trans)\b/,
  /\btransmission (slips|slipping|is out|went out|gone)\b/,
  /\bframe (damage|rot|is rotted)\b/, /\brusted out\b/,
  // Parts/scrap sellers and project cars.
  /\bpart(ing|s)? (it )?out\b/, /\bscrap(per| value| price)?\b/, /\bmechanic'?s? special\b/, /\bproject car\b/,
  // Engine internals — outside what Daniel fixes. Timing on interference
  // engines can mean bent valves; airbags deployed means a big collision.
  /\btiming (chain|belt|is off|needs|fixed|issue|problem|jumped)\b/, /\bneeds timing\b/, /\bjumped timing\b/,
  /\bhead gasket\b/, /\b(engine|rod) knock/, /\bknocking\b/, /\bairbags? (deployed|went off|blown)\b/,
];

const DEALER_SIGNS = [
  /\bfinanc(e|ing) (available|options)\b/, /\bwe finance\b/, /\bdoc(ument)? fee\b/,
  /\bdealer(ship)?\b/, /\bpre-?approved\b/, /\bcredit (is|are)? ?(ok|welcome)\b/,
  /\bbuy here pay here\b/, /\bour inventory\b/, /\bwarranty\b.*\bavailable\b/,
  /\bsales tax\b.*\btitle\b/, /\.com\b/,
];

// Not reasons to skip — reasons to look harder.
const MOTIVATED = [
  [/\bmust sell\b/, 'must sell'], [/\bneed(s)? (it )?gone\b/, 'need gone'],
  [/\bmoving\b/, 'moving'], [/\basap\b/, 'asap'], [/\bobo\b/, 'OBO'],
  [/\bcash only\b|\bcash today\b/, 'cash'], [/\bprice (drop|reduced)\b|\breduced\b/, 'reduced'],
  [/\bfirst \$?\d+ (takes|gets) it\b/, 'first $ takes it'],
];

const EASY_FIXES = [
  [/\bcheck engine\b|\bcel\b/, 'check engine'], [/\ba\/?c (does ?n[o']t|not|needs)\b|\bno (cold )?a\/?c\b/, 'A/C'],
  [/\bbrakes?\b/, 'brakes'], [/\btires?\b.*\b(need|bald|worn)\b/, 'tires'],
  [/\bbattery\b/, 'battery'], [/\bscratch|\bscuff|\bdent|\bbumper\b|\bcosmetic\b/, 'cosmetic'],
  [/\bwindow (switch|motor|regulator)\b/, 'window'], [/\bneeds? (minor|some) (work|tlc)\b|\btlc\b/, 'TLC'],
];

const lower = (s) => (s ?? '').toString().toLowerCase();

/** The fields we use, pulled out of the scraper's very wide record. */
function normalize(raw) {
  const price = Number(raw['listing_price']?.amount ?? raw['listing_price.amount'] ?? NaN);
  const title = raw.marketplace_listing_title ?? '';
  return {
    id: String(raw.id ?? raw.listingUrl ?? title),
    title,
    url: raw.listingUrl ?? (raw.id ? `https://www.facebook.com/marketplace/item/${raw.id}` : null),
    price,
    make: lower(raw.vehicle_make_display_name),
    model: lower(raw.vehicle_model_display_name),
    miles: raw.vehicle_odometer_data?.value ?? raw['vehicle_odometer_data.value'] ?? null,
    titleStatus: lower(raw.vehicle_title_status),
    sellerType: raw.vehicle_seller_type ?? null,
    dealership: raw.dealership_name ?? null,
    place: raw.location_text?.text ?? raw['location_text.text'] ?? '',
    postedAt: raw.creation_time_formatted ?? null,
    text: lower(`${title}\n${raw.redacted_description?.text ?? raw['redacted_description.text'] ?? ''}`),
    photo: raw.primary_listing_photo_url ?? raw.primary_listing_photo?.image?.uri ?? null,
    year: Number((title.match(/\b(19[89]\d|20[0-3]\d)\b/) ?? [])[1]) || null,
    sellerId: raw.marketplace_listing_seller?.id ?? raw['marketplace_listing_seller.id'] ?? null,
  };
}

/**
 * Decide one listing. Returns { pass, reason } and, when it passes, the flags
 * that go in the alert. The first failing rule is the reason — one is enough
 * to explain why a car was skipped.
 */
function evaluate(car) {
  if (!CONFIG.makes.includes(car.make)) return { pass: false, reason: `make: ${car.make || 'unknown'}` };
  if (car.make === 'honda' && !HONDA_CARS.some((m) => car.model.includes(m) || lower(car.title).includes(m))) {
    return { pass: false, reason: `not a Honda car: ${car.model || car.title}` };
  }
  if (car.postedAt && Date.now() - new Date(car.postedAt).getTime() > CONFIG.maxAgeDays * 864e5) {
    return { pass: false, reason: `older than ${CONFIG.maxAgeDays} days` };
  }
  if (car.year && car.year < CONFIG.minYear) return { pass: false, reason: `year ${car.year} < ${CONFIG.minYear}` };
  if (!Number.isFinite(car.price)) return { pass: false, reason: 'no price' };
  if (car.price < CONFIG.minPrice) return { pass: false, reason: `price $${car.price} below floor` };
  if (car.price > CONFIG.maxPrice) return { pass: false, reason: `price $${car.price} over cap` };

  if (['salvage', 'rebuilt', 'flood', 'junk'].some((t) => car.titleStatus.includes(t))) {
    return { pass: false, reason: `title: ${car.titleStatus}` };
  }
  const breaker = DEAL_BREAKERS.find((re) => re.test(car.text));
  if (breaker) return { pass: false, reason: `deal breaker: ${car.text.match(breaker)[0]}` };

  if (car.sellerType && car.sellerType !== 'PRIVATE_SELLER') return { pass: false, reason: `seller: ${car.sellerType}` };
  if (car.dealership) return { pass: false, reason: `dealership: ${car.dealership}` };
  const dealer = DEALER_SIGNS.find((re) => re.test(car.text));
  if (dealer) return { pass: false, reason: `dealer wording: ${car.text.match(dealer)[0]}` };

  return {
    pass: true,
    motivated: MOTIVATED.filter(([re]) => re.test(car.text)).map(([, label]) => label),
    easyFixes: EASY_FIXES.filter(([re]) => re.test(car.text)).map(([, label]) => label),
    // Private sellers price in round numbers; $14,495 is a lot. Kept as a hint,
    // not a filter — some private sellers do it too.
    maybeDealer: car.price % 50 !== 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CARFOLIO SCOUT — valuation.
//
// Turns a candidate plus 5–10 comparable listings into: market value, ARV,
// repair estimate, profit, max offer and a 0–100 buy score with reasons.
// Pure arithmetic — no network, no AI — so every number can be checked by hand.
// ─────────────────────────────────────────────────────────────────────────────

const VALUATION = {
  minProfit: 500,       // Daniel's floor: anything above this is worth a message
  minComps: 3,
  minScore: 70,         // only 🟢 COMPRAR reaches the phone          // Daniel's floor; 3–4 is flagged BAJA in the alert
  maxComps: 10,
  yearSpan: 2,          // comps within ±2 model years
  askToSold: 0.95,      // listings sell ~5% under asking
  lemonHaircut: 0.9,    // known-problem drivetrains resell for less
  otherCosts: 250,      // title, registration, tax, gas to go get it
  defaultPerMile: 0.03, // $/mile when there are too few comps to fit a slope
};

/** Known drivetrain problems. Shown with a warning and a lower ARV, never hidden. */
const LEMONS = [
  { make: 'nissan', models: ['altima', 'sentra', 'rogue', 'versa', 'pathfinder', 'murano'], years: [2013, 2018], why: 'CVT Nissan 2013–18' },
  { make: 'ford', models: ['focus', 'fiesta'], years: [2012, 2018], why: 'PowerShift (transmisión DPS6)' },
  { make: 'chevrolet', models: ['equinox'], years: [2010, 2017], why: 'Equinox 2.4 (consume aceite)', needs: /2\.4|\b4[- ]?cyl/ },
  { make: 'jeep', models: ['compass', 'patriot'], years: [2007, 2017], why: 'CVT Compass/Patriot' },
  { make: 'hyundai', models: ['sonata', 'santa fe', 'tucson'], years: [2011, 2019], why: 'motor Theta II 2.4' },
];

// Repair costs for what Daniel fixes himself — parts only, his labour is $0.
// [low, expected, high]. Engine and transmission damage never get here: those
// listings are rejected upstream as deal breakers.
// Each entry: what the ad says, the label, typical parts cost [low, expected,
// high], what to buy, and the RockAuto category it lives under. Prices are
// typical aftermarket ranges, not live quotes — RockAuto has no API.
const REPAIRS = [
  [/\bwater pump\b/, 'bomba de agua', [60, 150, 350], 'bomba de agua + coolant (si es EcoBoost, revisar que no pierda coolant)', 'Cooling System'],
  [/\b(cracked|chipped) (wind ?shield|glass)\b|\bwind ?shield (is )?(cracked|chipped)\b/, 'parabrisas', [150, 250, 400], 'parabrisas instalado (cotizar local)', ''],
  [/\balignment\b/, 'alineación', [80, 100, 140], 'alineación en taller', ''],
  [/\b(some|surface|little|minor) rust\b|\brust (spots?|on)\b|\bhas (some )?rust\b/, 'óxido', [50, 200, 600], 'revisar bajos y estribos; tratar/pintar', 'Body & Lamp Assembly'],
  [/\bneeds? (a )?detail(ed|ing)?\b/, 'detallado', [0, 50, 100], 'detallado a fondo', ''],
  [/\b(hit (a )?deer|deer hit|front[- ]?end (damage|hit)|front damage|fender bender|hood (is )?(damaged|bent|dented)|grille?)\b/, 'choque frontal', [400, 900, 1800], 'bumper cover, capó, faros, rejilla, soporte de radiador (usados/aftermarket)', 'Body & Lamp Assembly'],
  [/\b(rear[- ]?end (damage|hit)|rear damage|trunk (lid )?(damaged|dented))\b/, 'choque trasero', [250, 600, 1200], 'bumper trasero, tapa del baúl, calaveras', 'Body & Lamp Assembly'],
  [/\b(radiator|overheat\w*|coolant leak)\b/, 'enfriamiento', [80, 200, 450], 'radiador, termostato, mangueras', 'Cooling System'],
  [/\bcheck engine\b|\bcel\b|\bengine light\b/, 'check engine', [50, 200, 600], 'escanear código primero (O2, bobina, bujías, EVAP)', 'Ignition / Fuel & Air'],
  [/\ba\/?c\b.*\b(does ?n[o']t|not|needs|no)\b|\bno (cold )?a\/?c\b/, 'A/C', [60, 300, 900], 'recarga, o compresor/clutch si no engancha', 'Heat & Air Conditioning'],
  [/\bbrakes?\b/, 'frenos', [80, 180, 400], 'pastillas + discos delanteros', 'Brake & Wheel Hub'],
  [/\b(struts?|shocks?|control arms?|ball joints?|tie rods?|suspension)\b/, 'suspensión', [120, 300, 700], 'strut assembly, brazos/rótulas, terminales', 'Suspension / Steering'],
  [/\b(needs?|bald|worn)\b[^.!\n]{0,25}\btires?\b|\btires?\b[^.!\n]{0,15}\b(bald|worn|need)/, 'llantas', [150, 300, 650], 'llantas (2 o 4, usadas buenas o nuevas económicas)', 'Wheel / Tire'],
  [/\bbattery\b/, 'batería', [100, 150, 220], 'batería', 'Electrical'],
  [/\b(window (switch|motor|regulator))\b/, 'ventana', [30, 80, 180], 'switch o motor/regulador', 'Electrical-Switch & Relay / Body'],
  [/\b(scratch|scuff|dent|bumper|fender|cosmetic|paint)\w*/, 'cosmético', [50, 250, 700], 'pintura/retoque o bumper usado', 'Body & Lamp Assembly'],
  [/\b(sensor|o2|oxygen|maf|cam position|crank position)\b/, 'sensor', [40, 120, 300], 'sensor O2 / MAF / cam-crank', 'Fuel & Air / Emission Control'],
  [/\b(oil leak|leaks? oil|valve cover gasket)\b/, 'fuga de aceite', [30, 120, 400], 'empaque de tapa de válvulas / cárter', 'Engine'],
  [/\bneeds? (minor|some) (work|tlc)\b|\btlc\b/, 'TLC', [100, 300, 800], 'no dice qué — preguntar', ''],
];
const BASE_RECON = [80, 150, 250]; // detail, oil change, wipers — every flip

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Lowercase, letters and digits only — "F-150" and "f150 supercrew" both become "f150…". */
const key = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const modelRoot = (model) => key((model ?? '').trim().split(/\s+/)[0]);

function sameModel(a, b) {
  const ra = modelRoot(a);
  const rb = modelRoot(b);
  return ra.length > 1 && rb.length > 1 && (ra.startsWith(rb) || rb.startsWith(ra));
}

/**
 * Pick the comparables: same make and model, within ±2 years, priced like a
 * real car, then the closest ones by year and mileage. Never invents a comp —
 * if fewer than minComps survive, the caller is told the confidence is low.
 */
function pickComps(car, pool) {
  const usable = pool.filter(
    (c) =>
      c.id !== car.id &&
      // the same car reposted is not a comparable
      !(c.year === car.year && c.price === car.price && (c.miles ?? 0) === (car.miles ?? 0)) &&
      c.make === car.make &&
      sameModel(c.model, car.model) &&
      c.year && car.year && Math.abs(c.year - car.year) <= VALUATION.yearSpan &&
      Number.isFinite(c.price) && c.price >= 500 && c.price <= 60000,
  );
  // Drop obvious junk prices: $1,234, $123,456 placeholders and wild outliers.
  const mid = usable.length ? median(usable.map((c) => c.price)) : 0;
  for (const c of usable) if (c.miles != null && c.miles < 10000 && c.year < new Date().getFullYear() - 3) c.miles = null;
  const sane = usable.filter((c) => c.price >= mid * 0.35 && c.price <= mid * 2.5 && !/^(1234|12345|123456)$/.test(String(c.price)));

  const distance = (c) =>
    Math.abs(c.year - car.year) * 15000 + (c.miles && car.miles ? Math.abs(c.miles - car.miles) : 40000);
  return sane.sort((a, b) => distance(a) - distance(b)).slice(0, VALUATION.maxComps);
}

/**
 * How much a mile is worth for this model, from the comps themselves.
 * Theil–Sen: the median of every pairwise slope — one weird listing cannot drag
 * it, which matters when the sample is ten Marketplace ads.
 */
function perMile(comps) {
  const pts = comps.filter((c) => c.miles);
  if (pts.length < 5) return VALUATION.defaultPerMile;
  const slopes = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dm = pts[j].miles - pts[i].miles;
      if (Math.abs(dm) > 5000) slopes.push(-(pts[j].price - pts[i].price) / dm);
    }
  }
  if (!slopes.length) return VALUATION.defaultPerMile;
  return Math.min(0.12, Math.max(0, median(slopes)));
}

function lemonFor(car) {
  return LEMONS.find(
    (l) =>
      l.make === car.make &&
      l.models.some((m) => car.model.includes(m)) &&
      car.year >= l.years[0] && car.year <= l.years[1] &&
      (!l.needs || l.needs.test(car.text)),
  ) ?? null;
}

// Phrases that mention a part but say it's fine — "no check engine light",
// "new brakes", "not overheating", "tires at 90%" — are removed before matching.
const FINE = /(?<!\bneeds? (\d+ |a |some )?)\b(no|not|never|without|new|newer|brand new|recent(ly)?( replaced)?|replaced|good|great)\s+(\w+\s+){0,2}?(check engine( light)?|cel|engine light|brakes?( and brake \w+)?|brake \w+|tires?|battery|overheat\w*|leaks?|rust|a\/?c|struts?|shocks?)\b/g;

function estimateRepairs(car) {
  const text = (car.text ?? '').replace(FINE, ' ');
  const found = REPAIRS.filter(([re]) => re.test(text));
  const sum = (i) => found.reduce((s, [, , r]) => s + r[i], BASE_RECON[i]);
  return {
    items: found.map(([, label]) => label),
    detail: found.map(([, label, r, what, cat]) => ({ label, low: r[0], expected: r[1], high: r[2], what, cat })),
    low: sum(0),
    expected: sum(1),
    high: sum(2),
  };
}

/**
 * The full analysis for one candidate. `comps` are normalized listings from a
 * targeted search for the same model.
 */
function analyze(car, compsPool, verdict, now = Date.now()) {
  const comps = pickComps(car, compsPool);
  const repairs = estimateRepairs(car);
  const lemon = lemonFor(car);

  if (comps.length < VALUATION.minComps) {
    return { ok: false, reason: `solo ${comps.length} comparables`, comps, repairs, lemon };
  }

  // Each comp's price moved to the candidate's mileage, then the median.
  const rate = perMile(comps);
  const adjusted = comps.map((c) =>
    c.miles && car.miles ? c.price + (c.miles - car.miles) * rate : c.price,
  );
  const market = Math.round(median(adjusted));
  const arv = Math.round(market * VALUATION.askToSold * (lemon ? VALUATION.lemonHaircut : 1));

  const cost = car.price + repairs.expected + VALUATION.otherCosts;
  const profit = arv - cost;
  const profitWorst = arv - (car.price + repairs.high + VALUATION.otherCosts);
  const roi = profit / cost;
  const maxOffer = Math.max(0, Math.floor((arv - repairs.expected - VALUATION.otherCosts - VALUATION.minProfit) / 50) * 50);

  // ── Buy score: four parts, each one explainable ──────────────────────────
  const reasons = [];
  const discount = (market - car.price) / market;
  const pts = {
    roi: Math.max(0, Math.min(45, roi * 100)),               // 45% ROI = full marks
    discount: Math.max(0, Math.min(25, discount * 62.5)),    // 40% under market = full
    confidence: Math.min(15, comps.length * 1.5),            // 10 comps = full
    fresh: 0,
  };
  const ageMin = car.postedAt ? (now - new Date(car.postedAt).getTime()) / 60000 : null;
  if (ageMin != null) pts.fresh = ageMin <= 30 ? 15 : ageMin <= 360 ? 8 : ageMin <= 1440 ? 4 : 0;

  let score = pts.roi + pts.discount + pts.confidence + pts.fresh;
  if (discount > 0) reasons.push(`+ $${Math.round(market - car.price).toLocaleString('en-US')} bajo el mercado`);
  else reasons.push(`− $${Math.round(car.price - market).toLocaleString('en-US')} sobre el mercado`);
  if (verdict.motivated?.length) { score += 5; reasons.push(`+ vendedor con prisa (${verdict.motivated.join(', ')})`); }
  if (/\bruns (and drives )?(great|good|strong|well)\b|\bdrives great\b|\breliable\b/.test(car.text)) { score += 5; reasons.push('+ dice que anda bien'); }
  if (repairs.items.length) reasons.push(`− reparar: ${repairs.items.join(', ')}`);
  if (lemon) { score -= 15; reasons.push(`− ${lemon.why}`); }
  if (verdict.maybeDealer) { score -= 10; reasons.push('− precio de dealer'); }
  if (!car.miles) { score -= 5; reasons.push('− no dice millaje'); }
  if (profitWorst < 0) reasons.push('− si la reparación sale cara, pierdes');

  const confidence = comps.length >= 8 && car.miles ? 'ALTA' : comps.length >= 5 ? 'MEDIA' : 'BAJA';
  if (discount > 0.5) reasons.push('− más de 50% bajo mercado: pregunta qué tiene (o es estafa)');

  return {
    ok: true,
    comps,
    market,
    arv,
    repairs,
    lemon,
    perMile: rate,
    profit: Math.round(profit),
    profitWorst: Math.round(profitWorst),
    roi,
    maxOffer,
    score: Math.round(Math.max(0, Math.min(100, score))),
    confidence,
    reasons,
    // A banger: $500+ profit, still positive if repairs run high, and 🟢.
    worthIt: profit >= VALUATION.minProfit && profitWorst >= 0 && score >= VALUATION.minScore,
  };
}

const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** RockAuto's catalog page for this exact car — one tap to check part prices. */
function rockAutoUrl(car) {
  const slug = (s) => encodeURIComponent((s ?? '').toLowerCase().trim()).replace(/%20/g, '+');
  const model = (car.model ?? '').split(/\s+/)[0];
  return `https://www.rockauto.com/en/catalog/${slug(car.make)},${car.year},${slug(model)}`;
}

const ago = (car, now) => {
  const m = car.postedAt ? Math.round((now - new Date(car.postedAt).getTime()) / 60000) : null;
  return m == null ? '' : m < 60 ? ` · hace ${m} min` : ` · hace ${Math.round(m / 60)} h`;
};

const k$ = (n) => `$${(Math.round(n / 100) / 10).toLocaleString('en-US')}k`;
const visible = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;|&gt;|&amp;/g, '_').length;

/**
 * The whole alert in ONE photo caption: the numbers and the link on top, the
 * repairs, comparables and math folded in a tap-to-open block underneath.
 * Telegram allows 1,024 visible characters (links don't count), so the
 * comparables list shortens itself until it fits.
 */
function dealCaption(car, a, now = Date.now()) {
  const verdict = a.score >= 70 ? '🟢 COMPRAR' : a.score >= 50 ? '🟡 INVESTIGAR' : '⚪ REVISAR';
  const n = a.comps.length;
  const top = [
    `${verdict} · <b>${a.score}/100</b>`,
    `🚗 <a href="${car.url}"><b>${esc(car.title)}</b></a>`,
    `📍 ${esc(car.place)}${ago(car, now)}${car.miles ? ` · ${Number(car.miles).toLocaleString('en-US')} mi` : ''}`,
    `💵 Piden <b>${usd(car.price)}</b> · ARV <b>${usd(a.arv)}</b>`,
    `💰 Ganancia <b>${usd(a.profit)}</b> · ROI ${Math.round(a.roi * 100)}%`,
    `🎯 Oferta máx <b>${usd(a.maxOffer)}</b>`,
    `📊 ${n} comparables · confianza ${a.confidence}${n < 5 ? ' ⚠️' : ''}`,
  ];
  const fixes = [
    ...a.repairs.detail.map((r) => `• ${esc(r.label)} ~${usd(r.expected)} (${usd(r.low)}–${usd(r.high)}): ${esc(r.what)}${r.cat ? ` [${esc(r.cat)}]` : ''}`),
    `• básico ~${usd(BASE_RECON[1])} · otros ${usd(VALUATION.otherCosts)}`,
    `Total ~${usd(a.repairs.expected + VALUATION.otherCosts)} (peor ${usd(a.repairs.high + VALUATION.otherCosts)}) · <a href="${rockAutoUrl(car)}">RockAuto →</a>`,
  ];
  const math = [
    `Mercado ${usd(a.market)} ×0.95${a.lemon ? ' ×0.90' : ''} = ARV ${usd(a.arv)}`,
    `Peor caso: ${usd(a.profitWorst)}`,
    ...a.reasons.slice(0, 4).map(esc),
  ];
  const build = (k) => {
    const comps = a.comps.slice(0, k).map((c) =>
      `${c.year}${c.miles ? ` ${Math.round(c.miles / 1000)}k` : ''} ${c.url ? `<a href="${c.url}">${k$(c.price)}</a>` : k$(c.price)}`);
    const fold = ['🔧 <b>Arreglos</b>', ...fixes, '', `📊 <b>Comparables</b>`, comps.join(' · ') + (k < n ? ` (+${n - k})` : ''), '', '🧮 <b>Cuentas</b>', ...math];
    return `${top.join('\n')}\n<blockquote expandable>${fold.join('\n')}</blockquote>`;
  };
  for (let k = n; k >= 0; k--) { const c = build(k); if (visible(c) <= 1024) return c; }
  return `${top.join('\n')}\n<a href="${rockAutoUrl(car)}">RockAuto →</a>`;
}

// ── Runner ──

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const BACKFILL = input.backfill === true;
const MAX_COMP_SEARCHES = input.maxCompSearches ?? 8; // per run — a cost ceiling

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) throw new Error('Set TELEGRAM_TOKEN as a secret environment variable on this Actor.');

const store = await Actor.openKeyValueStore('carfolio-scout');
const SCRAPER = 'curious_coder/facebook-marketplace';
const PEORIA = '113848465291957';
const PROXY = { useApifyProxy: true, apifyProxyCountry: 'US' };

async function telegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) log.warning(`Telegram ${method} failed: ${json.description}`);
  return json;
}

let chatId = await store.getValue('chatId');
if (!chatId) {
  const updates = await telegram('getUpdates', {});
  const last = [...(updates.result ?? [])].reverse().find((u) => u.message?.chat?.id);
  chatId = last?.message.chat.id;
  if (!chatId) throw new Error('Open your bot in Telegram, press Start, then run this again.');
  await store.setValue('chatId', chatId);
}

// ── 🗑 buttons ─────────────────────────────────────────────────────────────
// Every alert carries a "Borrar" button. Telegram queues the taps; each run
// collects them and deletes those messages (Telegram allows this for 48 h).
const DEL_KB = { inline_keyboard: [[{ text: '🗑 Borrar', callback_data: 'del' }, { text: '🧹 Borrar todo', callback_data: 'delall' }]] };
{
  const offset = (await store.getValue('tgOffset')) ?? 0;
  const upd = await telegram('getUpdates', { offset, allowed_updates: ['callback_query'] });
  let last = offset - 1;
  const alertIds = (await store.getValue('alertMsgs')) ?? [];
  for (const u of upd.result ?? []) {
    last = Math.max(last, u.update_id);
    const q = u.callback_query;
    if (!q?.message) continue;
    const ids = q.data === 'delall' ? [...alertIds, q.message.message_id] : [q.message.message_id];
    for (const id of new Set(ids)) await telegram('deleteMessage', { chat_id: q.message.chat.id, message_id: id });
    if (q.data === 'delall') alertIds.length = 0;
  }
  await store.setValue('tgOffset', last + 1);
  await store.setValue('alertMsgs', alertIds);
}

let spent = 0; // what the scraper charged this run, when Apify reports it

async function scrape(url, { details, pages, onlyNew, cache }) {
  const run = await Actor.call(SCRAPER, {
    urls: [url],
    getListingDetails: details,
    getAllListingPhotos: false,
    strictFiltering: true,
    maxPagesPerUrl: pages,
    onlyNewListings: onlyNew,
    ...(cache ? { cacheStorageId: cache } : {}),
    proxy: PROXY,
  }, { memory: 2048 }); // keeps two overlapping runs inside the free plan's 8 GB
  const { items } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems();
  spent += Number(run.usageTotalUsd ?? 0);
  return items;
}

// ── 1. New listings ─────────────────────────────────────────────────────────
// Facebook only offers 1, 7 or 30 days. Normal runs: last 24 h with the
// scraper's "only new" cache. Backfill: 30 days, filtered to 10 in the rules.
const base = `https://www.facebook.com/marketplace/${PEORIA}/cars/?sortBy=creation_time_descend` +
  `&radius=${CONFIG.radiusKm}&exact=false&minPrice=${CONFIG.minPrice}&maxPrice=${CONFIG.maxPrice}&minYear=${CONFIG.minYear}`;

const fresh = BACKFILL
  ? await scrape(`${base}&daysSinceListed=30`, { details: true, pages: 8, onlyNew: false })
  : await scrape(`${base}&daysSinceListed=1`, { details: true, pages: 1, onlyNew: true, cache: 'carfolio-scout-cache' });
log.info(`Fetched ${fresh.length} listings${BACKFILL ? ' (backfill)' : ''}.`);

// ── 2. Rules, plus dealer detection by seller ───────────────────────────────
// A private seller has one car up. Anyone with three or more listings seen in
// the last 30 days is a dealer or a flipper, whatever the ad says.
const sellers = (await store.getValue('sellers')) ?? {};
const cutoff = Date.now() - 30 * 864e5;
for (const raw of fresh) {
  const car = normalize(raw);
  if (!car.sellerId) continue;
  const seen = (sellers[car.sellerId] ?? []).filter(([, t]) => t > cutoff);
  if (!seen.some(([id]) => id === car.id)) seen.push([car.id, Date.now()]);
  sellers[car.sellerId] = seen;
}

const sent = new Set((await store.getValue('sentIds')) ?? []);
const skipped = {};
const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };

const candidates = [];
for (const raw of fresh) {
  const car = normalize(raw);
  if (sent.has(car.id)) continue;
  sent.add(car.id); // decided once, never re-alerted
  // Normal runs only want what just went up. Anything older than 6 h that
  // Facebook pads the page with was already seen or is stale.
  if (!BACKFILL && car.postedAt && Date.now() - new Date(car.postedAt).getTime() > 6 * 36e5) { skip('older than 6 h'); continue; }
  const verdict = evaluate(car);
  if (!verdict.pass) { skip(verdict.reason.split(':')[0]); continue; }
  if (car.sellerId && (sellers[car.sellerId]?.length ?? 0) >= 3) { skip('seller with 3+ cars'); continue; }
  candidates.push({ car, verdict });
}
log.info(`${candidates.length} candidate(s) passed the rules.`);

// ── 3. Comparables database ─────────────────────────────────────────────────
// Every car the scout sees goes into a price database, grouped by make+model
// (e.g. "honda|civic"), with year, miles, price and link — never seller names
// or descriptions. The feed already pays for these listings, so the database
// fills itself for free. A paid comparables search runs ONLY when the
// database has fewer than 5 matches for that model ±2 years, and its results
// are stored too. Entries older than 60 days fall out.
const DB_TTL = 60 * 864e5;
const db = (await store.getValue('compsDb')) ?? {};
const slim = (c) => ({ id: c.id, url: c.url, year: c.year, miles: c.miles, price: c.price, model: c.model, t: Date.now() });
function remember(c) {
  if (!c.make || !c.year || !Number.isFinite(c.price) || !modelRoot(c.model)) return;
  const k = `${c.make}|${modelRoot(c.model)}`;
  const rows = (db[k] ??= []);
  const i = rows.findIndex((r) => r.id === c.id);
  if (i >= 0) rows[i] = { ...rows[i], price: c.price, miles: c.miles ?? rows[i].miles }; // price drops update
  else rows.push(slim(c));
}
const fromDb = (car) => (db[`${car.make}|${modelRoot(car.model)}`] ?? [])
  .filter((r) => Math.abs(r.year - car.year) <= VALUATION.yearSpan)
  .map((r) => ({ ...r, make: car.make }));

for (const raw of fresh) remember(normalize(raw));

let compSearches = 0;
let alerts = 0;

for (const { car, verdict } of candidates) {
  let pool = fromDb(car);
  if (pool.filter((r) => r.id !== car.id).length < 5) {
    if (compSearches >= MAX_COMP_SEARCHES) { skip('comp budget reached this run'); continue; }
    compSearches += 1;
    const query = encodeURIComponent((car.model ?? '').split(/\s+/)[0]);
    const url = `https://www.facebook.com/marketplace/${PEORIA}/cars/?query=${query}` +
      `&minYear=${car.year - VALUATION.yearSpan}&maxYear=${car.year + VALUATION.yearSpan}` +
      `&radius=${CONFIG.radiusKm}&exact=false&daysSinceListed=30&sortBy=creation_time_descend`;
    const items = await scrape(url, { details: true, pages: 1, onlyNew: false });
    for (const it of items) remember(normalize(it));
    pool = fromDb(car);
  }

  const a = analyze(car, pool, verdict);
  if (!a.ok) { skip(`no market (${a.reason})`); continue; }
  if (!a.worthIt) { skip(a.profit < VALUATION.minProfit ? 'profit under $500' : a.profitWorst < 0 ? 'loses if repairs run high' : 'score under 70'); continue; }

  // One message: photo, the numbers, the link, and the details folded below.
  const text = dealCaption(car, a);
  let msg = car.photo
    ? await telegram('sendPhoto', { chat_id: chatId, photo: car.photo, caption: text, parse_mode: 'HTML', reply_markup: DEL_KB })
    : { ok: false };
  if (!msg.ok) msg = await telegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: DEL_KB, link_preview_options: { is_disabled: true } });
  if (msg.result?.message_id) {
    const ids = (await store.getValue('alertMsgs')) ?? [];
    ids.push(msg.result.message_id);
    await store.setValue('alertMsgs', ids.slice(-200));
  }
  // A record of every alert, to calibrate against what Daniel actually buys.
  // Numbers only — no seller name, no description.
  await Actor.pushData({ at: new Date().toISOString(), url: car.url, title: car.title, price: car.price, miles: car.miles,
    market: a.market, arv: a.arv, repairs: a.repairs.expected, profit: a.profit, score: a.score, comps: a.comps.length });
  alerts += 1;
}

// ── Housekeeping ────────────────────────────────────────────────────────────
for (const k of Object.keys(db)) {
  db[k] = db[k].filter((r) => r.t > Date.now() - DB_TTL);
  if (!db[k].length) delete db[k];
}
for (const k of Object.keys(sellers)) if (!sellers[k].length) delete sellers[k];
await store.setValue('compsDb', db);
await store.setValue('sellers', sellers);
await store.setValue('sentIds', [...sent].slice(-8000));

// ── Daily "still alive" summary ─────────────────────────────────────────────
// Totals add up through the day; the first run at or after 10 pm Chicago time
// sends them once and starts a new day.
{
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  let day = (await store.getValue('daily')) ?? null;
  if (!day || day.date !== today) day = { date: today, runs: 0, seen: 0, candidates: 0, alerts: 0, compSearches: 0, spent: 0, skipped: {}, sent: false };
  day.runs += 1;
  day.seen += fresh.length;
  day.candidates += candidates.length;
  day.alerts += alerts;
  day.compSearches += compSearches;
  day.spent += spent;
  for (const [k, n] of Object.entries(skipped)) day.skipped[k] = (day.skipped[k] ?? 0) + n;

  if (!BACKFILL && !day.sent && Number(parts.hour) >= 22) {
    const LABELS = {
      make: 'otra marca', 'not a Honda car': 'Honda que no es carro', 'older than 10 days': 'muy viejo el anuncio',
      'older than 6 h': 'publicado hace +6 h', year: 'antes de 2008', price: 'fuera de precio', 'no price': 'sin precio',
      title: 'título malo', 'deal breaker': 'falla grave / salvage / partes', seller: 'dealer', dealership: 'dealer',
      'dealer wording': 'dealer', 'seller with 3+ cars': 'dealer (3+ carros)', 'profit under $500': 'ganancia < $500',
      'loses if repairs run high': 'riesgo de perder', 'score under 70': 'score < 70', 'comp budget reached this run': 'sin presupuesto de comparables',
    };
    const grouped = {};
    for (const [k, n] of Object.entries(day.skipped)) {
      const key = Object.keys(LABELS).find((l) => k.startsWith(l));
      const label = key ? LABELS[key] : k.startsWith('no market') ? 'pocos comparables' : k;
      grouped[label] = (grouped[label] ?? 0) + n;
    }
    const lines = Object.entries(grouped).sort((a, b) => b[1] - a[1]).map(([k, n]) => `• ${k}: ${n}`);
    const dbSize = Object.values(db).reduce((n, r) => n + r.length, 0);
    await telegram('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: [
        `📋 <b>Resumen de hoy</b> · ${day.runs} corridas`,
        `Revisé <b>${day.seen}</b> carros nuevos · ${day.candidates} pasaron filtros · <b>${day.alerts}</b> te llegaron`,
        '',
        'Descartados:',
        ...(lines.length ? lines : ['• ninguno']),
        '',
        `Búsquedas de comparables: ${day.compSearches} · base: ${dbSize} carros`,
        day.spent > 0 ? `Gasto del scraper hoy: ~$${day.spent.toFixed(2)}` : '',
      ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'),
    });
    day.sent = true;
  }
  await store.setValue('daily', day);
}

log.info(`Alerts: ${alerts}. Comp searches: ${compSearches}. Skipped: ${JSON.stringify(skipped)}`);
if (BACKFILL) {
  await telegram('sendMessage', {
    chat_id: chatId,
    text: `✅ Barrido de 10 días listo: ${fresh.length} carros revisados, ${alerts} con ganancia de $${VALUATION.minProfit}+. Base de comparables: ${Object.values(db).reduce((n, r) => n + r.length, 0)} carros.`,
  });
}
await Actor.exit();
