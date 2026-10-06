/**
 * ROOT LAYOUT — the boot sequence.
 *
 * Three things must finish before any screen renders, in this order:
 *   1. fonts        (otherwise text visibly reflows from a fallback face)
 *   2. migrations   (the schema must match the code that is about to query it)
 *   3. first read   (otherwise the dashboard flashes zeros, then fills in —
 *                    and a dashboard that briefly shows $0 profit is alarming)
 *
 * Migration failure gets a real screen rather than an endless spinner. With no
 * cloud copy behind this app, "it won't open" must not be a dead end: the
 * failure screen points at Backup & Restore, which is the actual way out.
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  JetBrainsMono_200ExtraLight,
  JetBrainsMono_300Light,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { RobotoMono_400Regular, RobotoMono_500Medium } from '@expo-google-fonts/roboto-mono';
import { Ionicons } from '@expo/vector-icons';

import { migrateDatabase, openDatabase, prepareDatabase } from '../db/client';
import { useApp } from '../state/store';
import { Colors, Space } from '../theme';
import { Button, Txt } from '../components/ui/primitives';

export default function RootLayout() {
  // Three families, three jobs: serif for titles, grotesque for the interface,
  // monospace for labels and figures that sit in columns.
  const [fontsLoaded, fontError] = useFonts({
    JetBrainsMono_200ExtraLight,
    JetBrainsMono_300Light,
    JetBrainsMono_500Medium,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    RobotoMono_400Regular,
    RobotoMono_500Medium,
    // Loaded explicitly rather than left to @expo/vector-icons to register
    // itself. On the web it did not, and every icon in the app rendered as an
    // empty box — a screen of grey squares where the controls should be.
    ...Ionicons.font,
  });

  const status = useApp((s) => s.status);
  const attach = useApp((s) => s.attach);
  const setStatus = useApp((s) => s.setStatus);

  // One boot sequence for both platforms. On the phone prepareDatabase() is a
  // no-op and expo-sqlite opens a file; on the web it loads the WebAssembly
  // build and restores the saved bytes. Neither branch is spelled out here,
  // which is the point: the platform difference lives in db/client.web.ts.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatus('migrating');
        await prepareDatabase();
        openDatabase();
        await migrateDatabase();
        if (cancelled) return;
        attach(openDatabase());
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setStatus('failed', error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attach, setStatus]);

  if (status === 'failed') {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={boot.container}>
          <Txt variant="title" center>
            Carfolio could not start
          </Txt>
          <Txt variant="small" tone="faint" center style={{ marginTop: Space.md, maxWidth: 320 }}>
            The database could not be prepared. Your data has not been changed. Restoring your most
            recent backup is the safest next step.
          </Txt>
          <Txt variant="micro" tone="faint" center style={{ marginTop: Space.lg }}>
            {useApp.getState().bootError}
          </Txt>
          <Button
            label="Try again"
            onPress={() => setStatus('starting')}
            full={false}
            style={{ marginTop: Space.xl }}
          />
        </View>
      </SafeAreaProvider>
    );
  }

  // A font that fails to download must never be the reason the app won't open.
  // Every family now carries a fallback stack, so the worst case is the system
  // face — which is a far better outcome than a permanently black screen.
  const fontsSettled = fontsLoaded || fontError != null;

  if (!fontsSettled || status !== 'ready') {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        {/* On the final background colour, never white — a white flash when
            opening a dark app looks like a crash. */}
        <View style={boot.container}>
          <ActivityIndicator color={Colors.brand} size="large" />
          {status === 'migrating' ? (
            <Txt variant="small" tone="faint" style={{ marginTop: Space.lg }}>
              Updating your database…
            </Txt>
          ) : null}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="vehicle/[id]" />
        <Stack.Screen name="vehicle/new" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="vehicle/sell" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </SafeAreaProvider>
  );
}

const boot = {
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: Space.xl,
  },
};
