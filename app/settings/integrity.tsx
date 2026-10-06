/**
 * DATA INTEGRITY — the accounting identity, shown to the user.
 *
 * Most apps hide this kind of check. Surfacing it is deliberate: if a dollar
 * ever goes missing, a visible complaint is far better than a dashboard that
 * quietly shows a wrong number with total confidence.
 *
 * The equation below is the same one asserted by a property test against
 * hundreds of randomized histories, so it failing here means something real.
 */

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Space } from '../../theme';
import { Card, Divider, Row, Screen, SectionHeader, Txt } from '../../components/ui/primitives';
import { DataRow, Money } from '../../components/ui/money';
import { ScreenHeader } from '../../components/domain/ScreenHeader';
import { useApp } from '../../state/store';
import { formatMoney } from '../../domain/money';

export default function Integrity() {
  const position = useApp((s) => s.position);
  const check = useApp((s) => s.integrity);

  return (
    <Screen>
      <ScreenHeader title="Data integrity" subtitle="Is every dollar accounted for?" />

      <View style={[panel, check.ok ? okPanel : badPanel]}>
        <Row gap={Space.md} style={{ alignItems: 'flex-start' }}>
          <Ionicons
            name={check.ok ? 'shield-checkmark' : 'warning'}
            size={22}
            color={check.ok ? Colors.profit : Colors.loss}
          />
          <View style={{ flex: 1 }}>
            <Txt variant="heading" style={{ color: check.ok ? Colors.profit : Colors.loss }}>
              {check.ok ? 'The books balance' : 'The books do not balance'}
            </Txt>
            <Txt variant="small" tone="faint" style={{ marginTop: 4 }}>
              {check.ok
                ? 'Every dollar in Carfolio is accounted for on both sides.'
                : `Assets and claims differ by ${formatMoney(check.discrepancyCents, { cents: true })}. Something is wrong — export a backup before making further changes.`}
            </Txt>
          </View>
        </Row>
      </View>

      <SectionHeader title="What Carfolio checks" style={{ marginTop: Space.xl }} />
      <Card style={{ marginBottom: Space.lg }}>
        <Txt variant="small" tone="muted">
          Everything the business holds must equal everything the business owes and owns:
        </Txt>
        <View style={equationPanel}>
          <Txt variant="micro" tone="faint" numeric>
            cash + deployed in vehicles + inventory
          </Txt>
          <Txt variant="micro" style={{ color: Colors.brand, marginVertical: 3 }}>
            must equal
          </Txt>
          <Txt variant="micro" tone="faint" numeric>
            protected capital + retained earnings + owed to Fernando
          </Txt>
        </View>
        <Txt variant="micro" tone="faint">
          If a reimbursement were ever counted twice, or a sale posted profit that did not match its
          expenses, this equation would stop holding. That is the point of it.
        </Txt>
      </Card>

      <SectionHeader title="What the business holds" />
      <Card style={{ marginBottom: Space.lg }}>
        <DataRow
          label="Cash on hand"
          valueNode={<Money cents={position.cashOnHandCents} variant="small" showCents />}
        />
        <DataRow
          label="Deployed in vehicles"
          valueNode={<Money cents={position.capitalDeployedCents} variant="small" showCents />}
        />
        <DataRow
          label="Inventory at cost"
          valueNode={<Money cents={position.inventoryValueCents} variant="small" showCents />}
        />
        <Divider spacing={Space.sm} />
        <DataRow
          label="Total"
          valueNode={<Money cents={check.assetsCents} variant="body" showCents />}
          emphasis
        />
      </Card>

      <SectionHeader title="What that is made of" />
      <Card style={{ marginBottom: Space.lg }}>
        <DataRow
          label="Protected capital"
          valueNode={<Money cents={position.protectedCapitalCents} variant="small" showCents />}
        />
        <DataRow
          label="Retained earnings"
          valueNode={<Money cents={position.retainedEarningsCents} variant="small" signed showCents />}
        />
        <DataRow
          label="Owed to Fernando"
          valueNode={<Money cents={position.owedToFernandoCents} variant="small" signed showCents />}
        />
        <Divider spacing={Space.sm} />
        <DataRow
          label="Total"
          valueNode={<Money cents={check.claimsCents} variant="body" showCents />}
          emphasis
        />
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="body" weight="bold">
            Difference
          </Txt>
          <Txt
            variant="heading"
            weight="extrabold"
            numeric
            style={{ color: check.ok ? Colors.profit : Colors.loss }}
          >
            {formatMoney(check.discrepancyCents, { cents: true, signed: true })}
          </Txt>
        </Row>
      </Card>

      <SectionHeader title="Reconciliation" style={{ marginTop: Space.xl }} />
      <Card>
        <DataRow
          label="Cumulative reinvestment recorded"
          valueNode={<Money cents={position.cumulativeReinvestmentCents} variant="small" />}
          hint="The reinvest decisions you made at each sale"
        />
        <DataRow
          label="Retained earnings"
          valueNode={<Money cents={position.retainedEarningsCents} variant="small" signed />}
          hint="Your realized share less distributions"
        />
        <Txt variant="micro" tone="faint" style={{ marginTop: Space.sm }}>
          These two agree when every sale&apos;s profit was fully allocated and no distribution was
          recorded outside a sale. A gap is not an error — taking a draw from Capital creates one on
          purpose — but a large unexplained gap is worth a look.
        </Txt>
      </Card>
    </Screen>
  );
}

const panel = {
  borderWidth: 1,
  borderRadius: Radius.lg,
  padding: Space.lg,
};
const okPanel = { backgroundColor: Colors.profitSoft, borderColor: '#1B5148' };
const badPanel = { backgroundColor: Colors.lossSoft, borderColor: Colors.loss };

const equationPanel = {
  backgroundColor: Colors.surface,
  borderRadius: Radius.md,
  padding: Space.md,
  marginVertical: Space.md,
  alignItems: 'center' as const,
};
