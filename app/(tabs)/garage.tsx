/**
 * GARAGE — vehicles bought and not yet sold.
 *
 * Sorted oldest-first by days held, deliberately. The car that has been sitting
 * longest is the one costing you money and the one you are most likely to have
 * stopped thinking about; burying it at the bottom of the list would be the
 * wrong default.
 */

import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Space } from '../../theme';
import {
  EmptyState,
  Row,
  Screen,
  Segmented,
  Txt,
} from '../../components/ui/primitives';
import { Money } from '../../components/ui/money';
import { GarageCard } from '../../components/domain/VehicleCard';
import { useApp, selectGarage } from '../../state/store';
import { filterByType, type TypeFilter } from '../../domain/analytics';
import { sumCents } from '../../domain/money';

const FILTERS: readonly { value: TypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'MYSELF', label: 'Myself' },
  { value: 'ASSOCIATED', label: 'Associated' },
];

export default function Garage() {
  const router = useRouter();
  const garage = useApp(selectGarage);
  const [filter, setFilter] = useState<TypeFilter>('ALL');

  const visible = useMemo(() => filterByType(garage, filter), [garage, filter]);
  const tiedUp = useMemo(
    () => sumCents(visible.map((r) => r.financials.totalInvestedCents)),
    [visible],
  );

  return (
    <Screen scroll={false}>
      <View style={{ marginBottom: Space.lg }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Txt variant="title">Garage</Txt>
            <Txt variant="small" tone="faint" style={{ marginTop: 4 }}>
              {visible.length} {visible.length === 1 ? 'vehicle' : 'vehicles'} in progress
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt variant="micro" tone="faint">
              TIED UP
            </Txt>
            <Money cents={tiedUp} variant="heading" weight="extrabold" />
          </View>
        </Row>
      </View>

      <Segmented
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        style={{ marginBottom: Space.md }}
      />

      {/* FlatList rather than ScrollView + map: with a ScrollView every row
          mounts even when three are visible, and the screen takes seconds to
          open once there is real history. */}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.vehicle.id}
        contentContainerStyle={{ gap: Space.sm, paddingBottom: Space.xxl }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          garage.length === 0 ? (
            <EmptyState
              icon="car-sport-outline"
              title="The garage is empty"
              body="Vehicles you've bought but haven't sold yet show up here, with everything you've put into them."
              actionLabel="Add a vehicle"
              onAction={() => router.push('/vehicle/new')}
            />
          ) : (
            <EmptyState
              icon="filter-outline"
              title="Nothing matches"
              body="No vehicles in the garage under this filter."
            />
          )
        }
        renderItem={({ item }) => (
          <GarageCard row={item} onPress={() => router.push(`/vehicle/${item.vehicle.id}`)} />
        )}
      />
    </Screen>
  );
}
