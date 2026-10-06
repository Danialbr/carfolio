/**
 * The vehicle row, in two flavours.
 *
 * Garage cards answer "what do I have in this, and how long has it been
 * sitting". History cards answer "what did I make". They share a header so a
 * car looks like itself in both places, and diverge below it because those are
 * genuinely different questions.
 */

import React from 'react';
import { Image, Platform, View } from 'react-native';
import { Asset } from 'expo-asset';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Space } from '../../theme';
import { Badge, PressableCard, Row, Txt, type BadgeTone } from '../ui/primitives';
import { Money, Percent } from '../ui/money';
import { formatDayCount } from '../../domain/dates';
import { STATUS_LABELS, TYPE_LABELS, vehicleTitle, vinShort } from '../../domain/vehicle';
import type { VehicleWithFinancials } from '../../domain/analytics';
import type { VehicleStatus } from '../../domain/types';
import { paintColor } from '../../domain/colors';

const HOLO = require('../../assets/holo-car.webp');

/**
 * The holographic car from Orbit's garage card, recoloured to the car's paint.
 * A CSS filter on the web build; the photo itself is never altered.
 */
export function HoloCar({ color, height = 150 }: { color: string; height?: number }) {
  const paint = paintColor(color);
  return (
    <View style={{ height, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000', marginBottom: Space.md }}>
      {Platform.OS === 'web' ? (
        React.createElement('img', {
          src: Asset.fromModule(HOLO).uri,
          alt: '',
          style: { width: '100%', height: '100%', objectFit: 'contain', filter: paint?.filter ?? 'none' },
        })
      ) : (
        <Image source={HOLO} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      )}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: paint?.hex ?? Colors.brand, opacity: 0.85 }} />
      {paint ? (
        <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,.55)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: paint.hex, borderWidth: 1, borderColor: 'rgba(255,255,255,.4)' }} />
          <Txt variant="micro" tone="muted">{paint.label}</Txt>
        </View>
      ) : null}
    </View>
  );
}

const STATUS_TONE: Record<VehicleStatus, BadgeTone> = {
  PURCHASED: 'neutral',
  IN_REPAIR: 'warn',
  READY: 'info',
  LISTED: 'brand',
  SOLD: 'profit',
};

export function StatusPill({ status }: { status: VehicleStatus }) {
  return <Badge label={STATUS_LABELS[status]} tone={STATUS_TONE[status]} />;
}

/** ASSOCIATED is the one that needs to stand out — it means someone else is owed. */
export function TypePill({ type }: { type: 'MYSELF' | 'ASSOCIATED' }) {
  return <Badge label={TYPE_LABELS[type]} tone={type === 'ASSOCIATED' ? 'info' : 'neutral'} />;
}

function Header({ row }: { row: VehicleWithFinancials }) {
  const { vehicle } = row;
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <View style={{ flex: 1, paddingRight: Space.sm }}>
        <Txt variant="body" weight="bold" numberOfLines={1}>
          {vehicleTitle(vehicle)}
        </Txt>
        <Row gap={Space.sm} style={{ marginTop: 4 }}>
          {vehicle.vin ? (
            <Txt variant="micro" tone="faint" numeric>
              VIN …{vinShort(vehicle.vin)}
            </Txt>
          ) : null}
          <TypePill type={vehicle.type} />
        </Row>
      </View>
      <StatusPill status={vehicle.status} />
    </Row>
  );
}

export function GarageCard({ row, onPress }: { row: VehicleWithFinancials; onPress: () => void }) {
  const { financials } = row;
  const { breakdown } = financials;

  return (
    <PressableCard onPress={onPress} accessibilityLabel={vehicleTitle(row.vehicle)}>
      <HoloCar color={row.vehicle.color} />
      <Header row={row} />

      <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: Space.md }} />

      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Txt variant="micro" tone="faint">
            PURCHASE
          </Txt>
          <Money cents={breakdown.purchasePriceCents} variant="small" tone="muted" />
        </View>
        <View>
          <Txt variant="micro" tone="faint">
            ADDITIONAL
          </Txt>
          <Money cents={breakdown.additionalInvestmentCents} variant="small" tone="muted" />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt variant="micro" tone="faint">
            TOTAL INVESTED
          </Txt>
          <Money cents={financials.totalInvestedCents} variant="body" weight="extrabold" />
        </View>
      </Row>

      <Row style={{ justifyContent: 'space-between', marginTop: Space.md }}>
        <Row gap={5}>
          <Ionicons name="time-outline" size={13} color={Colors.text2} />
          <Txt variant="micro" tone="faint" numeric>
            {formatDayCount(financials.daysHeld)} held
          </Txt>
        </Row>

        {financials.estimatedProfitCents != null ? (
          <Row gap={5}>
            <Txt variant="micro" tone="faint">
              EST. PROFIT
            </Txt>
            <Money cents={financials.estimatedProfitCents} variant="small" signed />
          </Row>
        ) : null}
      </Row>
    </PressableCard>
  );
}

export function HistoryCard({ row, onPress }: { row: VehicleWithFinancials; onPress: () => void }) {
  const { financials } = row;

  return (
    <PressableCard onPress={onPress} accessibilityLabel={vehicleTitle(row.vehicle)}>
      <Header row={row} />

      <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: Space.md }} />

      {financials.sold ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt variant="micro" tone="faint">
                INVESTED
              </Txt>
              <Money cents={financials.totalInvestedCents} variant="small" tone="muted" />
            </View>
            <View>
              <Txt variant="micro" tone="faint">
                SOLD FOR
              </Txt>
              <Money cents={financials.salePriceCents} variant="small" tone="muted" />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt variant="micro" tone="faint">
                PROFIT
              </Txt>
              <Money cents={financials.grossProfitCents} variant="body" signed weight="extrabold" />
            </View>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: Space.md }}>
            <Txt variant="micro" tone="faint" numeric>
              {formatDayCount(financials.daysHeld)} to sell
            </Txt>
            <Row gap={5}>
              <Txt variant="micro" tone="faint">
                ROI
              </Txt>
              <Percent ratio={financials.roi} variant="small" />
            </Row>
          </Row>
        </>
      ) : (
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="small" tone="faint">
            In the garage · {formatDayCount(financials.daysHeld)}
          </Txt>
          <Money cents={financials.totalInvestedCents} variant="body" weight="extrabold" />
        </Row>
      )}
    </PressableCard>
  );
}
