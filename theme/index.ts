import { Platform } from 'react-native';

/**
 * THEME — one file, the whole look.
 *
 * Three ideas hold this together, and every value below follows from one of
 * them:
 *
 *   DEPTH BY LAYER, NOT BY SHADOW.  Each surface is one step lighter than the
 *   one beneath it — #000 page, #07060B card, #0D0B13 raised. Borders are white
 *   at 7% opacity: present enough to organise, faint enough to disappear. There
 *   are no drop shadows inside the app.
 *
 *   WEIGHT IS NOT EMPHASIS.  Large figures are set LIGHT. A $18,420 in
 *   extrabold reads as a scoreboard; the same number at weight 300 in tabular
 *   digits reads as an instrument. Emphasis comes from size and space instead.
 *
 *   MONOSPACE CARRIES THE MEANING.  Titles, labels and every figure are set in
 *   monospace; only running prose is a grotesque. Fixed-width digits line up in
 *   columns, and uppercase mono at wide tracking is the register of an
 *   instrument panel rather than a consumer app.
 *
 * Two colour systems stay deliberately separate:
 *
 *   BRAND (violet)    Identity and calls to action, used as a STROKE — a rule,
 *                     an underline, an outline — never as a saturated fill.
 *   SEMANTIC (money)  Mint is profit, rose is loss, and nothing else is ever
 *                     given those two hues. If mint appeared on a button as
 *                     well as on a number, a glance at the screen would stop
 *                     telling the truth about whether the month went well.
 *
 * Contrast is verified against the CARD background, not the page background —
 * almost all text in this app sits on a card, and a value that only passes on
 * the darkest layer fails where it is actually read.
 */

/**
 * Font names carry a fallback stack on the web, and only there.
 *
 * react-native-web passes `fontFamily` straight through to CSS, so a name the
 * browser never managed to load leaves the element with NO usable family — and
 * the browser then falls back to its own default, which in Safari is Times. One
 * failed font download turned the entire app serif on an iPhone while looking
 * perfect in Chrome, because Chrome's default happens to be a grotesque.
 *
 * A stack costs nothing and makes that failure invisible: the app lands on the
 * system's own monospace or sans instead of a book face. Native ignores this
 * entirely — there, a family name is a registered font, not a CSS list.
 */
const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function face(name: string, stack: string): string {
  return Platform.OS === 'web' ? `${name}, ${stack}` : name;
}

export const Colors = {
  // Layers, darkest to lightest. Near-black with a violet bias rather than a
  // cold blue-grey, so the accent looks native to the page.
  bg: '#000000',
  surface: '#07060B',
  card: '#07060B',
  cardElevated: '#0D0B13',
  cardHigh: '#14111C',

  // Hairlines. White at low alpha reads as a lit edge on any layer, which a
  // fixed hex cannot do once surfaces differ.
  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.13)',
  /** A single lit thread along the top edge of a card. The expensive detail. */
  sheen: 'rgba(167, 139, 250, 0.22)',
  /** The technical accent. Never on money — that hue set is spoken for. */
  cyan: '#5EEAD4',

  // Brand — violet. Strokes and identity only.
  brand: '#C4B5FD',
  brandMid: '#A78BFA',
  brandDim: '#7B6BAE',
  brandInk: '#140C28',
  brandSoft: 'rgba(167, 139, 250, 0.08)',
  brandBorder: 'rgba(167, 139, 250, 0.34)',

  // Money. Never used for anything that is not a gain or a loss.
  profit: '#6EE7C8',
  profitSoft: 'rgba(110, 231, 200, 0.07)',
  profitBorder: 'rgba(110, 231, 200, 0.3)',
  loss: '#F2748F',
  lossSoft: 'rgba(242, 116, 143, 0.07)',
  lossBorder: 'rgba(242, 116, 143, 0.3)',

  // Other states. Sky is the partner colour — bluer than profit-mint so the
  // two never read as the same signal.
  info: '#7DD3FC',
  infoSoft: 'rgba(125, 211, 252, 0.07)',
  infoBorder: 'rgba(125, 211, 252, 0.3)',
  warn: '#E3B15E',
  warnSoft: 'rgba(227, 177, 94, 0.07)',
  neutral: '#9C97AD',
  neutralSoft: 'rgba(255, 255, 255, 0.04)',

  // Text, in descending emphasis. text2 is 4.6:1 on `card`.
  text0: '#F2F0F7',
  text1: '#9C97AD',
  text2: '#6A657C',
  text3: '#464154',

  overlay: 'rgba(0, 0, 0, 0.78)',
  shadow: '#000000',
} as const;

/**
 * Type by role. `display` carries titles and every number. `mono` carries the
 * small uppercase labels. `family` is the grotesque, and it only ever sets
 * sentences — the moment a value appears, it is monospace.
 */
export const Type = {
  /**
   * Titles are set in monospace, uppercase, widely tracked — the register of
   * an instrument panel rather than a magazine. A serif title read as classic
   * and, at small sizes on a phone, as cheap. This does not.
   */
  display: {
    light: face('JetBrainsMono_200ExtraLight', MONO_STACK),
    regular: face('JetBrainsMono_300Light', MONO_STACK),
    medium: face('JetBrainsMono_500Medium', MONO_STACK),
  },
  mono: {
    regular: face('RobotoMono_400Regular', MONO_STACK),
    medium: face('RobotoMono_500Medium', MONO_STACK),
  },
  /**
   * Deliberately damped: what a screen calls `extrabold` renders at 600, and
   * `regular` at 300. Nothing in this app is heavier than semibold, which is
   * the single change that stops the figures looking like a scoreboard.
   */
  family: {
    regular: face('Inter_300Light', SANS_STACK),
    medium: face('Inter_400Regular', SANS_STACK),
    semibold: face('Inter_500Medium', SANS_STACK),
    bold: face('Inter_500Medium', SANS_STACK),
    extrabold: face('Inter_600SemiBold', SANS_STACK),
  },
  /**
   * A 4px-stepped scale. Everything sits on it, so a figure set next to its
   * label shares the label's size and their baselines line up instead of
   * drifting a pixel or two apart — which is what "nothing quite lines up"
   * actually looks like on screen.
   */
  size: {
    display: 24,
    title: 18,
    heading: 16,
    body: 14,
    small: 13,
    label: 10,
    micro: 11,
  },
} as const;

export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Nearly square. Radius is what separates a control panel from a toy: 10px on
 * a large card is enough to stop it looking like a raw div, and anything more
 * starts to look friendly, which is not what this app is for.
 */
export const Radius = {
  sm: 2,
  md: 4,
  lg: 10,
  pill: 999,
} as const;

/**
 * Figures line up in columns all over this app — expense lists, breakdowns,
 * analytics tables. Proportional digits make those columns ragged and make two
 * amounts of the same magnitude look different lengths.
 */
export const tabular = { fontVariant: ['tabular-nums' as const] };

/** Money is mint when it helps you and rose when it doesn't. Zero is neutral. */
export function moneyColor(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return Colors.text0;
  return cents > 0 ? Colors.profit : Colors.loss;
}

/**
 * Depth comes from layering, so `card` carries no shadow at all. Only things
 * that genuinely float above the page — a modal sheet — cast one.
 */
export const Elevation = {
  card: {},
  sheet: {
    shadowColor: Colors.shadow,
    shadowOpacity: 0.7,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -10 },
    elevation: 16,
  },
} as const;
