/**
 * MORE — the hub for everything that isn't the daily vehicle workflow.
 */

import React from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space } from '../../theme';
import { Card, Divider, Row, Screen, SectionHeader, Txt } from '../../components/ui/primitives';
import { Money } from '../../components/ui/money';
import { useApp } from '../../state/store';
import { daysBetween, formatShortDate, todayISO } from '../../domain/dates';

function LinkRow({
  icon,
  label,
  detail,
  onPress,
  tone = 'default',
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
  tone?: 'default' | 'brand' | 'warn';
  last?: boolean;
}) {
  const color = tone === 'brand' ? Colors.brand : tone === 'warn' ? Colors.warn : Colors.text1;
  return (
    <View>
      <Row
        onTouchEnd={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ paddingVertical: Space.md }}
        gap={Space.md}
      >
        <View style={[iconWrap, tone === 'brand' && { backgroundColor: Colors.brandSoft }]}>
          <Ionicons name={icon} size={17} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="body" weight="semibold">
            {label}
          </Txt>
          {detail ? (
            <Txt variant="micro" tone="faint" style={{ marginTop: 4 }}>
              {detail}
            </Txt>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.text3} />
      </Row>
      {!last ? <Divider spacing={0} /> : null}
    </View>
  );
}

export default function More() {
  const router = useRouter();
  const position = useApp((s) => s.position);
  const fernando = useApp((s) => s.fernando);
  const inventory = useApp((s) => s.snapshot.inventory);
  const sold = useApp((s) => s.vehicles.filter((v) => v.financials.sold).length);
  const lastExportAt = useApp((s) => s.lastExportAt);

  const daysSinceExport =
    lastExportAt == null ? null : (daysBetween(lastExportAt, todayISO()) ?? null);
  // Everything lives on this one device. Two weeks without an export is worth
  // flagging in amber before it becomes a story about a lost phone.
  const backupStale = daysSinceExport == null || daysSinceExport > 14;
  const backupDetail =
    lastExportAt == null
      ? 'Never exported — your data exists only on this phone'
      : `Last export ${formatShortDate(lastExportAt)}`;

  const go = (href: string) => () => router.push(href as Href);

  return (
    <Screen>
      <Txt variant="title" style={{ marginBottom: Space.xl }}>
        More
      </Txt>

      <SectionHeader title="Money" />
      <Card padding={Space.md} style={{ marginBottom: Space.lg }}>
        <LinkRow
          icon="lock-closed-outline"
          label="Capital"
          detail="Contributions, deployment and distributions"
          onPress={go('/capital')}
          tone="brand"
        />
        <LinkRow
          icon="people-outline"
          label="Fernando"
          detail={
            fernando.balanceCents >= 0
              ? `You owe ${money(fernando.balanceCents)}`
              : `Carrying ${money(-fernando.balanceCents)} of losses`
          }
          onPress={go('/fernando')}
        />
        <LinkRow
          icon="cube-outline"
          label="Inventory"
          detail={`${inventory.length} ${inventory.length === 1 ? 'item' : 'items'} in stock`}
          onPress={go('/inventory')}
          last
        />
      </Card>

      <SectionHeader title="Reporting" />
      <Card padding={Space.md} style={{ marginBottom: Space.lg }}>
        <LinkRow
          icon="stats-chart-outline"
          label="Analytics"
          detail={`Performance across ${sold} sold ${sold === 1 ? 'vehicle' : 'vehicles'}`}
          onPress={go('/analytics')}
        />
        <LinkRow
          icon="calendar-outline"
          label="Year to date"
          detail="Yearly totals, split by Myself and Associated"
          onPress={go('/ytd')}
        />
        <LinkRow
          icon="car-outline"
          label="My Cars"
          detail="Only the vehicles you worked alone"
          onPress={go('/(tabs)/vehicles?type=MYSELF')}
        />
        <LinkRow
          icon="document-text-outline"
          label="Business report"
          detail="A PDF summary you can send on"
          onPress={go('/reports')}
          last
        />
      </Card>

      <SectionHeader title="Your data" />
      <Card padding={Space.md}>
        <LinkRow
          icon="save-outline"
          label="Backup & restore"
          detail={backupDetail}
          onPress={go('/settings/backup')}
          tone={backupStale ? 'warn' : 'default'}
        />
        <LinkRow
          icon="pricetags-outline"
          label="Expense categories"
          detail="Add your own"
          onPress={go('/settings/categories')}
        />
        <LinkRow
          icon="shield-checkmark-outline"
          label="Data integrity"
          detail="Check that every dollar is accounted for"
          onPress={go('/settings/integrity')}
          last
        />
      </Card>

      <Card style={{ marginTop: Space.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="micro" tone="faint">
            TOTAL LIFETIME PROFIT
          </Txt>
          <Money cents={position.grossProfitCents} variant="body" signed weight="extrabold" />
        </Row>
      </Card>

      <Txt variant="micro" tone="faint" center style={{ marginTop: Space.xl }}>
        Carfolio · everything stays on this device
      </Txt>
    </Screen>
  );
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

const iconWrap = {
  width: 34,
  height: 34,
  borderRadius: Radius.sm,
  backgroundColor: Colors.cardElevated,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
