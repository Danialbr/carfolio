/**
 * Bottom sheet and the pickers built on it.
 *
 * A plain Modal rather than a gesture library: this app needs a panel that
 * appears, takes input and goes away. Adding a pan-responder dependency for a
 * drag-to-dismiss affordance would be weight without benefit, and every sheet
 * here already has a visible close control and a backdrop tap.
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Elevation, Radius, Space } from '../../theme';
import { Row, Txt } from './primitives';

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + Space.lg }]}>
          <View style={s.grabber} />
          <Row style={{ justifyContent: 'space-between', marginBottom: Space.lg }}>
            <View style={{ flex: 1 }}>
              <Txt variant="heading">{title}</Txt>
              {subtitle ? (
                <Txt variant="small" tone="faint" style={{ marginTop: 4 }}>
                  {subtitle}
                </Txt>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Colors.text2} />
            </Pressable>
          </Row>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 520 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
  detail?: string;
  group?: string;
}

/** A searchable-free list picker. Groups render as sticky-ish section labels. */
export function OptionSheet<T extends string>({
  visible,
  onClose,
  title,
  options,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: readonly Option<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
}) {
  // Group headings are computed up front rather than by mutating a variable
  // while rendering: a render pass must not depend on how many times it has
  // already run.
  const showGroupAt = options.map(
    (option, index) => option.group != null && option.group !== options[index - 1]?.group,
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {options.map((option, index) => {
        const showGroup = showGroupAt[index];
        const active = option.value === selected;

        return (
          <View key={option.value}>
            {showGroup ? (
              <Txt
                variant="label"
                tone="faint"
                style={{ marginTop: Space.md, marginBottom: Space.xs }}
              >
                {option.group}
              </Txt>
            ) : null}
            <Pressable
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                s.option,
                active && s.optionActive,
                pressed && { opacity: 0.75 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Txt variant="body" weight={active ? 'bold' : 'regular'}>
                  {option.label}
                </Txt>
                {option.detail ? (
                  <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
                    {option.detail}
                  </Txt>
                ) : null}
              </View>
              {active ? <Ionicons name="checkmark" size={18} color={Colors.brand} /> : null}
            </Pressable>
          </View>
        );
      })}
    </Sheet>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.overlay },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg + 6,
    borderTopRightRadius: Radius.lg + 6,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    ...Elevation.sheet,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    alignSelf: 'center',
    marginBottom: Space.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: 13,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionActive: { backgroundColor: Colors.brandSoft, borderColor: Colors.brandBorder },
});
