/**
 * VEHICLES — the complete permanent record.
 *
 * Everything ever entered, including cars still in the garage, because "did I
 * ever have a 2014 Civic" is a question about history, not about status.
 * "My Cars" is this same list filtered to MYSELF, reachable from More.
 */

import React, { useMemo, useState } from 'react';
import { FlatList, TextInput, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space, Type } from '../../theme';
import { EmptyState, Screen, Segmented, Txt } from '../../components/ui/primitives';
import { HistoryCard } from '../../components/domain/VehicleCard';
import { useApp, selectHistory } from '../../state/store';
import { filterByType, type TypeFilter } from '../../domain/analytics';
import { vehicleTitle } from '../../domain/vehicle';

type SoldFilter = 'ALL' | 'SOLD' | 'GARAGE';

const SOLD_FILTERS: readonly { value: SoldFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'GARAGE', label: 'In garage' },
  { value: 'SOLD', label: 'Sold' },
];

export default function Vehicles() {
  const router = useRouter();
  // "My Cars" opens this same screen pre-filtered rather than duplicating it.
  const params = useLocalSearchParams<{ type?: string }>();
  const history = useApp(selectHistory);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>(
    params.type === 'MYSELF' || params.type === 'ASSOCIATED' ? params.type : 'ALL',
  );
  const [soldFilter, setSoldFilter] = useState<SoldFilter>('ALL');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return filterByType(history, typeFilter)
      .filter((r) =>
        soldFilter === 'ALL'
          ? true
          : soldFilter === 'SOLD'
            ? r.financials.sold
            : !r.financials.sold,
      )
      .filter((r) => {
        if (needle === '') return true;
        const haystack = `${vehicleTitle(r.vehicle)} ${r.vehicle.vin}`.toLowerCase();
        return haystack.includes(needle);
      });
  }, [history, typeFilter, soldFilter, query]);

  return (
    <Screen scroll={false}>
      <Txt variant="title" style={{ marginBottom: Space.xs }}>
        {typeFilter === 'MYSELF' ? 'My Cars' : 'Vehicles'}
      </Txt>
      <Txt variant="small" tone="faint" style={{ marginBottom: Space.lg }}>
        {visible.length} of {history.length} · complete history
      </Txt>

      <View style={s.search}>
        <Ionicons name="search" size={16} color={Colors.text2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search make, model or VIN"
          placeholderTextColor={Colors.text3}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.searchInput}
        />
        {query !== '' ? (
          <Ionicons
            name="close-circle"
            size={16}
            color={Colors.text2}
            onPress={() => setQuery('')}
          />
        ) : null}
      </View>

      <Segmented
        options={SOLD_FILTERS}
        value={soldFilter}
        onChange={setSoldFilter}
        style={{ marginBottom: Space.sm }}
      />
      <Segmented
        options={[
          { value: 'ALL' as const, label: 'All' },
          { value: 'MYSELF' as const, label: 'Myself' },
          { value: 'ASSOCIATED' as const, label: 'Associated' },
        ]}
        value={typeFilter}
        onChange={setTypeFilter}
        style={{ marginBottom: Space.md }}
      />

      <FlatList
        data={visible}
        keyExtractor={(item) => item.vehicle.id}
        contentContainerStyle={{ gap: Space.sm, paddingBottom: Space.xxl }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          history.length === 0 ? (
            <EmptyState
              icon="albums-outline"
              title="No history yet"
              body="Every vehicle you enter stays here permanently, sold or not."
              actionLabel="Add a vehicle"
              onAction={() => router.push('/vehicle/new')}
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No matches"
              body="Nothing here fits that search and those filters."
            />
          )
        }
        renderItem={({ item }) => (
          <HistoryCard row={item} onPress={() => router.push(`/vehicle/${item.vehicle.id}`)} />
        )}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    height: 44,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Space.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.text0,
    fontFamily: Type.family.regular,
    fontSize: Type.size.body,
    padding: 0,
  },
});
