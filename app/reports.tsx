/**
 * REPORTS — generate a PDF and hand it off.
 *
 * Reached either from a vehicle (with ?vehicle=<id>, which pre-selects it) or
 * from More for the business summary.
 */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Space } from '../theme';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Row,
  Screen,
  SectionHeader,
  Txt,
} from '../components/ui/primitives';
import { SelectField, Field } from '../components/ui/money';
import { OptionSheet, type Option } from '../components/ui/Sheet';
import { ScreenHeader } from '../components/domain/ScreenHeader';
import { notify } from '../components/ui/dialog';
import { useApp } from '../state/store';
import { activeYears, summarize, summarizeYear } from '../domain/analytics';
import { todayISO } from '../domain/dates';
import { vehicleTitle } from '../domain/vehicle';
import { businessReportHtml, vehicleReportHtml } from '../services/reports/templates';
import { renderAndShare, safeFilename } from '../services/reports/render';

export default function Reports() {
  const params = useLocalSearchParams<{ vehicle?: string }>();

  const rows = useApp((s) => s.vehicles);
  const snapshot = useApp((s) => s.snapshot);
  const position = useApp((s) => s.position);
  const fernando = useApp((s) => s.fernando);

  const years = useMemo(() => activeYears(rows), [rows]);
  const [vehicleId, setVehicleId] = useState<string | null>(params.vehicle ?? null);
  const [year, setYear] = useState<number>(years[0] ?? new Date().getFullYear());
  const [vehicleSheet, setVehicleSheet] = useState(false);
  const [yearSheet, setYearSheet] = useState(false);
  const [busy, setBusy] = useState<'vehicle' | 'business' | null>(null);

  const vehicleOptions = useMemo<Option<string>[]>(
    () =>
      rows.map((r) => ({
        value: r.vehicle.id,
        label: vehicleTitle(r.vehicle),
        detail: r.financials.sold ? 'Sold' : 'In garage',
      })),
    [rows],
  );

  const selected = rows.find((r) => r.vehicle.id === vehicleId) ?? null;

  const makeVehicleReport = async () => {
    if (!selected) return;
    setBusy('vehicle');
    const html = vehicleReportHtml({
      row: selected,
      expenses: snapshot.expenses.filter((e) => e.vehicleId === selected.vehicle.id),
      fernandoEntries: snapshot.fernandoEntries,
      issuedOn: todayISO(),
    });
    const result = await renderAndShare(html, safeFilename(vehicleTitle(selected.vehicle)));
    setBusy(null);
    if (!result.ok) void notify('Could not create the PDF', result.error ?? 'Unknown error.');
  };

  const makeBusinessReport = async () => {
    setBusy('business');
    const html = businessReportHtml({
      year,
      yearSummary: summarizeYear(rows, year),
      allTime: summarize(rows),
      position,
      fernando,
      vehicles: rows,
      issuedOn: todayISO(),
    });
    const result = await renderAndShare(html, safeFilename(`Carfolio business ${year}`));
    setBusy(null);
    if (!result.ok) void notify('Could not create the PDF', result.error ?? 'Unknown error.');
  };

  if (rows.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Reports" />
        <EmptyState
          icon="document-text-outline"
          title="Nothing to report yet"
          body="Add a vehicle and Carfolio can produce a PDF you can send to anyone."
        />
      </Screen>
    );
  }

  return (
    <>
      <Screen>
        <ScreenHeader title="Reports" subtitle="Professional PDFs you can send on" />

        <SectionHeader title="Vehicle report" />
        <Card style={{ marginBottom: Space.lg }}>
          <Txt variant="small" tone="faint" style={{ marginBottom: Space.md }}>
            One vehicle in full: the complete investment breakdown, the sale, the profit and how it
            was split. This is the document to send Fernando when an associated car closes.
          </Txt>
          <Field label="Vehicle">
            <SelectField
              value={selected ? vehicleTitle(selected.vehicle) : null}
              placeholder="Choose a vehicle"
              onPress={() => setVehicleSheet(true)}
            />
          </Field>
          <Button
            label="Create vehicle PDF"
            icon="document-text-outline"
            onPress={makeVehicleReport}
            disabled={!selected}
            loading={busy === 'vehicle'}
          />
        </Card>

        <SectionHeader title="Business summary" />
        <Card style={{ marginBottom: Space.lg }}>
          <Txt variant="small" tone="faint" style={{ marginBottom: Space.md }}>
            The whole business for a year: capital position, YTD figures split by Myself and
            Associated, Fernando&apos;s running balance, all-time performance and the full vehicle
            history.
          </Txt>
          <Field label="Year">
            <SelectField
              value={String(year)}
              placeholder="Choose a year"
              onPress={() => setYearSheet(true)}
            />
          </Field>
          <Button
            label="Create business PDF"
            variant="secondary"
            icon="stats-chart-outline"
            onPress={makeBusinessReport}
            loading={busy === 'business'}
          />
        </Card>

        <Divider />

        <Row gap={6} style={{ alignItems: 'flex-start' }}>
          <Ionicons
            name="information-circle-outline"
            size={13}
            color={Colors.text2}
            style={{ marginTop: 4 }}
          />
          <View style={{ flex: 1 }}>
            <Txt variant="micro" tone="faint">
              Every report is stamped with the date it was generated. Editing a record afterwards
              changes the app but not a PDF you have already sent, so treat an issued report as a
              snapshot of that moment.
            </Txt>
          </View>
        </Row>
      </Screen>

      <OptionSheet
        visible={vehicleSheet}
        onClose={() => setVehicleSheet(false)}
        title="Choose a vehicle"
        options={vehicleOptions}
        selected={vehicleId}
        onSelect={setVehicleId}
      />
      <OptionSheet
        visible={yearSheet}
        onClose={() => setYearSheet(false)}
        title="Choose a year"
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
        selected={String(year)}
        onSelect={(value) => setYear(Number(value))}
      />
    </>
  );
}
