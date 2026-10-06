/**
 * Paint colour chips. One tap picks; tapping the selected one again clears it.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Colors, Space } from '../../theme';
import { Txt } from '../ui/primitives';
import { PAINT_COLORS } from '../../domain/colors';

export function ColorPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const selected = PAINT_COLORS.find((c) => c.id === value);
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
        {PAINT_COLORS.map((c) => {
          const on = c.id === value;
          return (
            <Pressable
              key={c.id}
              accessibilityLabel={c.label}
              onPress={() => onChange(on ? '' : c.id)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: c.hex,
                borderWidth: on ? 3 : 1,
                borderColor: on ? Colors.text0 : 'rgba(255,255,255,.25)',
              }}
            />
          );
        })}
      </ScrollView>
      <Txt variant="micro" tone="faint" style={{ marginTop: Space.xs }}>
        {selected ? selected.label : 'Sin color'}
      </Txt>
    </View>
  );
}
