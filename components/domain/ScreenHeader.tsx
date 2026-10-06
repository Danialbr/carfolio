/**
 * The back affordance for any screen pushed onto the stack.
 *
 * A labelled row rather than a bare chevron: on a screen full of numbers, an
 * unlabelled arrow in the corner is easy to miss and easy to mistake for a
 * decrement control.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Space } from '../../theme';
import { Row, Txt } from '../ui/primitives';

export function ScreenHeader({
  title,
  subtitle,
  right,
  backLabel = 'Back',
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  backLabel?: string;
}) {
  const router = useRouter();

  return (
    <View style={{ marginBottom: Space.lg }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={{ alignSelf: 'flex-start', marginBottom: Space.md }}
      >
        <Row gap={2}>
          <Ionicons name="chevron-back" size={19} color={Colors.text1} />
          <Txt variant="small" tone="muted" weight="semibold">
            {backLabel}
          </Txt>
        </Row>
      </Pressable>

      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: Space.md }}>
          <Txt variant="title">{title}</Txt>
          {subtitle ? (
            <Txt variant="small" tone="faint" style={{ marginTop: 4 }}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        {right}
      </Row>
    </View>
  );
}
