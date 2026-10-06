/**
 * MONEY COMPONENTS
 *
 * The pieces that make the app read as a financial instrument rather than a
 * database front-end: figures that colour themselves by sign, a stat tile, and
 * an amount input that cannot produce a wrong number.
 */

import React, { useState } from 'react';
import { StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space, Type, moneyColor, tabular } from '../../theme';
import { formatMoney, formatPercent, parseAmount, type Cents } from '../../domain/money';
import { Card, Row, Txt } from './primitives';

// ─── Figures ────────────────────────────────────────────────────────────────

/**
 * An amount, coloured by what it means.
 *
 * `signed` is for results — profit, a balance, a variance — where the sign is
 * the information. Costs are rendered plain: an $850 repair is not a negative
 * number to the person who paid it, and painting every expense red would make
 * the screen look like a disaster when it is just a car being fixed.
 */
export function Money({
  cents,
  variant = 'body',
  signed = false,
  showCents = false,
  tone,
  weight,
  style,
}: {
  cents: Cents | null | undefined;
  variant?: 'display' | 'title' | 'heading' | 'body' | 'small' | 'label';
  signed?: boolean;
  showCents?: boolean;
  tone?: 'default' | 'muted' | 'faint';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
  style?: ViewStyle;
}) {
  if (cents == null) {
    return (
      <Txt variant={variant} tone="faint" numeric style={style}>
        —
      </Txt>
    );
  }

  const color = signed
    ? moneyColor(cents)
    : tone === 'muted'
      ? Colors.text1
      : tone === 'faint'
        ? Colors.text2
        : Colors.text0;

  return (
    <Txt
      variant={variant}
      // No automatic bump to semibold: a value set heavier than the label
      // beside it reads as a different size and breaks the line they share.
      weight={weight}
      numeric
      style={[{ color }, style]}
    >
      {formatMoney(cents, { signed, cents: showCents })}
    </Txt>
  );
}

export function Percent({
  ratio,
  variant = 'body',
  signed = true,
}: {
  ratio: number | null;
  variant?: 'title' | 'heading' | 'body' | 'small';
  signed?: boolean;
}) {
  const color = ratio == null ? Colors.text2 : signed ? moneyColor(ratio) : Colors.text0;
  return (
    <Txt variant={variant} numeric style={{ color }}>
      {formatPercent(ratio)}
    </Txt>
  );
}

// ─── Stat tile ──────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  style,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'profit' | 'loss' | 'brand' | 'muted';
  style?: ViewStyle;
}) {
  const color = {
    default: Colors.text0,
    profit: Colors.profit,
    loss: Colors.loss,
    brand: Colors.brand,
    muted: Colors.text1,
  }[tone];

  return (
    <Card padding={Space.md} style={[{ flex: 1, minWidth: 108 }, style]}>
      <Txt variant="micro" tone="faint" weight="semibold" numberOfLines={1}>
        {label.toUpperCase()}
      </Txt>
      <Txt
        variant="heading"
        weight="extrabold"
        numeric
        style={{ color, marginTop: 8 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Txt>
      {sub ? (
        <Txt variant="micro" tone="faint" style={{ marginTop: 4 }} numberOfLines={1}>
          {sub}
        </Txt>
      ) : null}
    </Card>
  );
}

/** A label/value pair. The workhorse of every detail screen. */
export function DataRow({
  label,
  value,
  valueNode,
  emphasis = false,
  hint,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <View style={{ paddingVertical: 10 }}>
      <Row style={{ justifyContent: 'space-between' }} gap={Space.md}>
        <Txt
          variant={emphasis ? 'body' : 'small'}
          tone={emphasis ? 'default' : 'faint'}
          weight={emphasis ? 'bold' : 'regular'}
          style={{ flexShrink: 1 }}
        >
          {label}
        </Txt>
        {valueNode ?? (
          <Txt variant={emphasis ? 'body' : 'small'} weight={emphasis ? 'semibold' : undefined} numeric>
            {value ?? '—'}
          </Txt>
        )}
      </Row>
      {hint ? (
        <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

// ─── Inputs ─────────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  children,
  style,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ marginBottom: Space.lg }, style]}>
      <Txt variant="label" tone="faint" style={{ marginBottom: 8 }}>
        {label}
      </Txt>
      {children}
      {error ? (
        <Txt variant="micro" style={{ color: Colors.loss, marginTop: 8 }}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="micro" tone="faint" style={{ marginTop: 8 }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'sentences',
  multiline = false,
  keyboardType = 'default',
  autoFocus = false,
  maxLength,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  autoFocus?: boolean;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.text3}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      multiline={multiline}
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      maxLength={maxLength}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        s.input,
        multiline && { height: 92, paddingTop: 12, textAlignVertical: 'top' },
        focused && s.inputFocused,
      ]}
    />
  );
}

/**
 * An amount input that is impossible to get wrong.
 *
 * The user types freely — "8,000", "8000.50", "$8,000" — and the raw string is
 * kept while they type, because reformatting mid-keystroke moves the cursor and
 * makes the field fight back. On blur it is parsed once with parseAmount and
 * echoed back in canonical form, so what they see is exactly what was stored.
 *
 * The value handed to the parent is always integer cents, never a string and
 * never a float.
 */
export function MoneyField({
  cents,
  onChange,
  placeholder = '0',
  autoFocus = false,
  allowNegative = false,
}: {
  cents: Cents;
  onChange: (cents: Cents) => void;
  placeholder?: string;
  autoFocus?: boolean;
  allowNegative?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const displayed =
    draft ?? (cents === 0 ? '' : formatMoney(cents, { bare: true, cents: cents % 100 !== 0 }));

  return (
    <View style={[s.input, s.moneyWrap, focused && s.inputFocused]}>
      <Txt variant="heading" tone="faint" weight="semibold">
        $
      </Txt>
      <TextInput
        value={displayed}
        onChangeText={setDraft}
        onFocus={() => {
          setFocused(true);
          setDraft(displayed);
        }}
        onBlur={() => {
          setFocused(false);
          const parsed = parseAmount(draft ?? '');
          onChange(allowNegative ? parsed : Math.abs(parsed));
          setDraft(null);
        }}
        placeholder={placeholder}
        placeholderTextColor={Colors.text3}
        keyboardType="decimal-pad"
        autoFocus={autoFocus}
        style={s.moneyInput}
      />
    </View>
  );
}

export function SelectField({
  value,
  placeholder,
  onPress,
}: {
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={s.input}>
      <Row style={{ justifyContent: 'space-between', flex: 1 }}>
        <Txt
          variant="body"
          tone={value ? 'default' : 'faint'}
          weight={value ? 'semibold' : 'regular'}
          onPress={onPress}
          style={{ flex: 1 }}
          numberOfLines={1}
        >
          {value ?? placeholder}
        </Txt>
        <Ionicons name="chevron-down" size={16} color={Colors.text2} onPress={onPress} />
      </Row>
    </View>
  );
}

const s = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Space.md,
    color: Colors.text0,
    fontFamily: Type.family.regular,
    fontSize: Type.size.body,
    justifyContent: 'center',
  },
  inputFocused: { borderColor: Colors.brandBorder, backgroundColor: Colors.cardElevated },
  moneyWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 0 },
  moneyInput: {
    flex: 1,
    color: Colors.text0,
    fontFamily: Type.family.bold,
    fontSize: Type.size.heading,
    padding: 0,
    ...tabular,
  },
});
