/**
 * Five slots, with the centre one acting as the add button.
 *
 * The FAB is mounted as a tab rather than floated over the screen: it centres
 * without width arithmetic, and it cannot end up covering the last row of a
 * list the way a floating button does.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Colors, Radius, Type } from '../../theme';

function AddButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={s.fabSlot}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Add a vehicle"
        style={({ pressed }) => [s.fab, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="add" size={26} color={Colors.brand} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // On web the home-indicator gap is handled by the page's own safe-area
  // padding, so the bar only needs its own breathing room.
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 6 : 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Height must include the bottom inset or the labels sit under the
        // home indicator on gesture-navigation phones.
        // The web build reports no safe-area inset, so a floor is applied
        // here — without it the labels sit flush against the bottom of an
        // installed home-screen app and get clipped by the home indicator.
        tabBarStyle: [
          s.bar,
          { height: 58 + bottomInset, paddingBottom: bottomInset + 6 },
        ],
        tabBarActiveTintColor: Colors.brand,
        tabBarInactiveTintColor: Colors.text2,
        tabBarLabelStyle: s.label,
        // Labels on the phone, icons only on the web build. react-navigation's
        // web tab bar collapses the label box to a 1px sliver whatever style it
        // is given, and a row of clipped text is worse than none: the five
        // icons are unambiguous, and the active one is violet. Revisit if the
        // library fixes its web label layout.
        tabBarShowLabel: Platform.OS !== 'web',
        tabBarLabelPosition: 'below-icon',
        tabBarItemStyle: s.item,
        sceneStyle: { backgroundColor: Colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Ionicons name="grid-outline" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'Garage',
          tabBarIcon: ({ color }) => <Ionicons name="car-sport-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarButton: () => (
            <AddButton
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push('/vehicle/new');
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: 'Vehicles',
          tabBarIcon: ({ color }) => <Ionicons name="albums-outline" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={21} color={color} />,
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  item: { paddingTop: 2, paddingBottom: 0 },
  label: {
    fontFamily: Type.family.medium,
    fontSize: 10,
    letterSpacing: 0.4,
    // An explicit line height: react-native-web lets the label box collapse,
    // and a label clipped to a sliver is worse than no label at all.
    lineHeight: 13,
    marginTop: 4,
  },
  fabSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // No large negative margin: on Android a touch outside the parent's bounds
  // never reaches the child, so a button pulled halfway out of its slot has a
  // dead upper half. 50x50 fits inside the slot and stays fully tappable.
  // Outlined, not a filled violet disc: a solid circle of colour was the one
  // element on the screen still reading as a consumer app.
  fab: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.brandBorder,
    backgroundColor: Colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
    shadowColor: Colors.brand,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
