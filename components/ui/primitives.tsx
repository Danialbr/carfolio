/**
 * UI PRIMITIVES — presentational only.
 *
 * Nothing in this file knows what a vehicle is, imports from domain/, or does
 * arithmetic. They take values and render them. Business meaning is applied by
 * the caller, which is what keeps these reusable and keeps the screens honest
 * about where their numbers come from.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Space, Type, tabular } from '../../theme';

// ─── Text ───────────────────────────────────────────────────────────────────

type TextTone = 'default' | 'muted' | 'faint' | 'brand' | 'profit' | 'loss';
type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'small' | 'label' | 'micro';

const TONE: Record<TextTone, string> = {
  default: Colors.text0,
  muted: Colors.text1,
  faint: Colors.text2,
  brand: Colors.brand,
  profit: Colors.profit,
  loss: Colors.loss,
};

interface TxtProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  weight?: keyof typeof Type.family;
  numeric?: boolean;
  center?: boolean;
}

/**
 * The family is chosen by ROLE, not by the caller: titles and every number are
 * monospace, labels are monospace, only prose is a grotesque. `weight` selects
 * a cut within that family, which is why a screen asking for `extrabold` on a
 * title still gets a light one. Restraint enforced in one place beats restraint
 * asked for in fifteen screens.
 */
function faceFor(
  variant: TextVariant,
  weight: keyof typeof Type.family | undefined,
  numeric: boolean,
): string {
  // Every figure is monospace, whatever size it is printed at. This is the
  // single rule that makes columns of money line up and stops a dashboard
  // reading like a consumer app.
  if (numeric) {
    if (variant === 'display' || variant === 'title') {
      return weight === 'extrabold' || weight === 'bold' ? Type.display.medium : Type.display.light;
    }
    return weight === 'extrabold' || weight === 'bold' ? Type.display.medium : Type.display.regular;
  }
  if (variant === 'display' || variant === 'title') return Type.brand;
  if (variant === 'label') {
    return weight === 'regular' ? Type.mono.regular : Type.mono.medium;
  }
  const defaultWeight: keyof typeof Type.family =
    variant === 'heading' ? 'semibold' : variant === 'micro' ? 'medium' : 'regular';
  return Type.family[weight ?? defaultWeight];
}

export function Txt({
  variant = 'body',
  tone = 'default',
  weight,
  numeric = false,
  center = false,
  style,
  ...rest
}: TxtProps) {
  const composed: TextStyle = {
    fontFamily: faceFor(variant, weight, numeric),
    fontSize: Type.size[variant],
    color: TONE[tone],
    // Titles are tracked OUT, not in: wide uppercase monospace is what reads as
    // an instrument. Figures are tracked slightly in so long amounts stay tight.
    letterSpacing:
      variant === 'display'
        ? numeric ? 0 : 3
        : variant === 'title'
          ? numeric ? 0 : 2
          : variant === 'label'
            ? 1.4
            : numeric
              ? -0.3
              : 0,
    // Line heights are on the same 4px step as the sizes. Left to the platform
    // they come out at fractional values and every stacked pair of lines sits
    // at a slightly different distance from the next.
    lineHeight:
      variant === 'display'
        ? 32
        : variant === 'title'
          ? 28
          : variant === 'heading'
            ? 24
            : variant === 'body'
              ? 22
              : variant === 'small'
                ? 20
                : variant === 'micro'
                  ? 16
                  : 16,
    textTransform:
      variant === 'label' || ((variant === 'display' || variant === 'title') && !numeric) ? 'uppercase' : undefined,
    textAlign: center ? 'center' : undefined,
  };

  return <Text {...rest} style={[composed, numeric && tabular, style]} />;
}

// ─── Layout ─────────────────────────────────────────────────────────────────

export function Screen({
  children,
  scroll = true,
  refreshControl,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const padding: ViewStyle = {
    paddingTop: insets.top + Space.md,
    // Clears the tab bar plus the home-indicator inset. Without this the last
    // row of every list sits underneath the tab bar and cannot be tapped.
    paddingBottom: insets.bottom + 96,
    paddingHorizontal: Space.lg,
  };

  if (!scroll) {
    return <View style={[s.screen, padding, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

/**
 * A single lit thread along the top edge. It is one pixel of white at 5%, and
 * it is the difference between a flat rectangle and a surface catching light.
 */
function Sheen() {
  return <View pointerEvents="none" style={s.sheen} />;
}

export function Card({
  children,
  style,
  elevated = false,
  padding = Space.lg,
  ...rest
}: ViewProps & { elevated?: boolean; padding?: number }) {
  return (
    <View
      {...rest}
      style={[
        s.card,
        { padding, backgroundColor: elevated ? Colors.cardElevated : Colors.card },
        style,
      ]}
    >
      <Sheen />
      {children}
    </View>
  );
}

export function Row({ children, style, gap = Space.md, ...rest }: ViewProps & { gap?: number }) {
  return (
    <View {...rest} style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>
      {children}
    </View>
  );
}

export function Divider({ spacing = Space.md }: { spacing?: number }) {
  return <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: spacing }} />;
}

export function SectionHeader({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
}) {
  return (
    // The gap above a section is part of the section, not something each
    // screen remembers to add — which is why they were all slightly different.
    // A screen can still override it by passing marginTop in `style`.
    <Row
      style={[
        { justifyContent: 'space-between', marginTop: Space.xl, marginBottom: Space.md },
        style,
      ]}
    >
      <Txt variant="label" tone="faint">
        {title}
      </Txt>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          {/* The action shares the heading's register rather than sitting in
              the body face, which read as a stray link. */}
          <Txt variant="label" tone="brand">
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </Row>
  );
}

// ─── Buttons ────────────────────────────────────────────────────────────────

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  full?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'primary',
  icon,
  loading = false,
  full = true,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  // The primary action is an outline, not a slab of colour: a violet rule on
  // near-black. It reads as the most considered thing on the screen instead of
  // the loudest, and it stops competing with the figures for attention.
  const palette = {
    primary: { bg: Colors.brandSoft, fg: Colors.brand, border: Colors.brandBorder },
    secondary: { bg: Colors.cardElevated, fg: Colors.text0, border: Colors.border },
    ghost: { bg: 'transparent', fg: Colors.text1, border: 'transparent' },
    danger: { bg: Colors.lossSoft, fg: Colors.loss, border: Colors.lossBorder },
  }[variant];

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: isDisabled ? 0.45 : pressed ? 0.82 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
          paddingHorizontal: full ? Space.lg : Space.lg,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Row gap={Space.sm}>
          {icon ? <Ionicons name={icon} size={17} color={palette.fg} /> : null}
          <Text style={[s.buttonLabel, { color: palette.fg }]}>{label}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  tone = 'default',
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: 'default' | 'brand' | 'danger';
  label: string;
}) {
  const color =
    tone === 'brand' ? Colors.brandInk : tone === 'danger' ? Colors.loss : Colors.text1;
  const bg = tone === 'brand' ? Colors.brand : Colors.cardElevated;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // 36px visual, but hitSlop brings the touch target above the 44px
      // minimum without the icon looking oversized.
      hitSlop={8}
      style={({ pressed }) => [s.iconButton, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}

export function PressableCard({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        s.card,
        { padding: Space.lg, backgroundColor: pressed ? Colors.cardElevated : Colors.card },
        style,
      ]}
    >
      <Sheen />
      {children}
    </Pressable>
  );
}

// ─── Badges ─────────────────────────────────────────────────────────────────

export type BadgeTone = 'neutral' | 'brand' | 'profit' | 'loss' | 'info' | 'warn';

const BADGE: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: 'transparent', fg: Colors.text1, border: Colors.borderStrong },
  brand: { bg: 'transparent', fg: Colors.brand, border: Colors.brandBorder },
  profit: { bg: 'transparent', fg: Colors.profit, border: Colors.profitBorder },
  loss: { bg: 'transparent', fg: Colors.loss, border: Colors.lossBorder },
  info: { bg: 'transparent', fg: Colors.info, border: Colors.infoBorder },
  warn: { bg: 'transparent', fg: Colors.warn, border: Colors.borderStrong },
};

/**
 * An outlined chip with a status dot, not a filled pill. Filled pills in six
 * colours turn a list into confetti; an outline plus one 4px dot says the same
 * thing quietly, and keeps saturated colour reserved for the money figures.
 */
export function Badge({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
}) {
  const c = BADGE[tone];
  return (
    <View style={[s.badge, { backgroundColor: c.bg, borderColor: c.border }, style]}>
      {tone !== 'neutral' ? <View style={[s.badgeDot, { backgroundColor: c.fg }]} /> : null}
      <Text style={[s.badgeLabel, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: Space.xxl }}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={24} color={Colors.text2} />
      </View>
      <Txt variant="heading" center style={{ marginTop: Space.lg }}>
        {title}
      </Txt>
      <Txt variant="small" tone="faint" center style={{ marginTop: Space.sm, maxWidth: 280 }}>
        {body}
      </Txt>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} full={false} style={{ marginTop: Space.lg }} />
      ) : null}
    </Card>
  );
}

// ─── Segmented control ──────────────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[s.segmented, style]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[s.segment, active && s.segmentActive]}
          >
            <Text style={[s.segmentLabel, active && s.segmentLabelActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: 1,
    backgroundColor: Colors.sheen,
  },
  button: {
    height: 50,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontFamily: Type.mono.medium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeDot: { width: 4, height: 4, borderRadius: 2 },
  badgeLabel: {
    fontFamily: Type.mono.medium,
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Underlined tabs rather than a pill switch: one violet rule marks the
  // selection, which is the same stroke-not-fill rule the rest of the app uses.
  segmented: {
    flexDirection: 'row',
    gap: Space.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  segment: {
    paddingVertical: 9,
    marginBottom: -1,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  segmentActive: { borderBottomColor: Colors.brand },
  segmentLabel: {
    fontFamily: Type.family.regular,
    fontSize: Type.size.small,
    color: Colors.text2,
  },
  segmentLabelActive: { color: Colors.text0, fontFamily: Type.family.medium },
});
