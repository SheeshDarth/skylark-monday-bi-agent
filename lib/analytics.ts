import type { MondaySnapshot, SnapshotRow } from "./monday";

function clean(value?: string) {
  return (value || "").trim();
}

function lower(value?: string) {
  return clean(value).toLowerCase();
}

function numeric(value?: string) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isJunkDeal(row: SnapshotRow) {
  const name = lower(row.name);
  return !name || name === "deal name" || Object.keys(row.values).length <= 1;
}

function addGroup(groups: Map<string, { count: number; maskedValueUnits: number }>, key: string, value: number) {
  const label = key || "Missing";
  const current = groups.get(label) || { count: 0, maskedValueUnits: 0 };
  current.count += 1;
  current.maskedValueUnits += value;
  groups.set(label, current);
}

function sortedGroups(groups: Map<string, { count: number; maskedValueUnits: number }>) {
  return Array.from(groups, ([label, value]) => ({ label, ...value })).sort(
    (a, b) => b.maskedValueUnits - a.maskedValueUnits,
  );
}

export function buildAnalyticsSummary(snapshot: MondaySnapshot) {
  const openBySector = new Map<string, { count: number; maskedValueUnits: number }>();
  const openByStage = new Map<string, { count: number; maskedValueUnits: number }>();
  const topOpenDeals: Array<{
    deal: string;
    owner: string;
    sector: string;
    stage: string;
    maskedValueUnits: number;
  }> = [];

  const dealExclusions = {
    junkRows: 0,
    notOpen: 0,
    missingMaskedValue: 0,
  };

  let openDeals = 0;
  let openDealsWithValue = 0;
  let totalOpenMaskedValueUnits = 0;

  for (const row of snapshot.boards.deals.rows) {
    if (isJunkDeal(row)) {
      dealExclusions.junkRows += 1;
      continue;
    }

    if (lower(row.values["Deal Status"]) !== "open") {
      dealExclusions.notOpen += 1;
      continue;
    }

    openDeals += 1;
    const value = numeric(row.values["Masked Deal value"]);
    if (value === null) {
      dealExclusions.missingMaskedValue += 1;
      continue;
    }

    openDealsWithValue += 1;
    totalOpenMaskedValueUnits += value;
    const sector = clean(row.values["Sector/service"]) || "Missing sector";
    const stage = clean(row.values["Deal Stage"]) || "Missing stage";
    addGroup(openBySector, sector, value);
    addGroup(openByStage, stage, value);
    topOpenDeals.push({
      deal: row.name,
      owner: clean(row.values["Owner code"]) || "Missing owner",
      sector,
      stage,
      maskedValueUnits: value,
    });
  }

  topOpenDeals.sort((a, b) => b.maskedValueUnits - a.maskedValueUnits);

  const billingStatusCounts = new Map<string, number>();
  const executionStatusCounts = new Map<string, number>();
  let receivableRows = 0;
  let totalReceivableMaskedUnits = 0;
  let missingReceivableRows = 0;

  for (const row of snapshot.boards.workOrders.rows) {
    const billingStatus = clean(row.values["Billing Status"]) || clean(row.values["Invoice Status"]) || "Missing";
    billingStatusCounts.set(billingStatus, (billingStatusCounts.get(billingStatus) || 0) + 1);

    const executionStatus = clean(row.values["Execution Status"]) || "Missing";
    executionStatusCounts.set(executionStatus, (executionStatusCounts.get(executionStatus) || 0) + 1);

    const receivable = numeric(row.values["Amount Receivable (Masked)"]);
    if (receivable === null) {
      missingReceivableRows += 1;
    } else {
      receivableRows += 1;
      totalReceivableMaskedUnits += receivable;
    }
  }

  return {
    pipeline: {
      totalDealRows: snapshot.boards.deals.itemCount,
      fetchedDealRows: snapshot.boards.deals.fetchedCount,
      openDeals,
      openDealsWithValue,
      totalOpenMaskedValueUnits,
      exclusions: dealExclusions,
      topOpenDeals: topOpenDeals.slice(0, 8),
      openBySector: sortedGroups(openBySector),
      openByStage: sortedGroups(openByStage),
    },
    workOrders: {
      totalWorkOrderRows: snapshot.boards.workOrders.itemCount,
      fetchedWorkOrderRows: snapshot.boards.workOrders.fetchedCount,
      billingStatusCounts: Array.from(billingStatusCounts, ([label, count]) => ({ label, count })).sort(
        (a, b) => b.count - a.count,
      ),
      executionStatusCounts: Array.from(executionStatusCounts, ([label, count]) => ({ label, count })).sort(
        (a, b) => b.count - a.count,
      ),
      receivables: {
        rowsWithReceivable: receivableRows,
        missingReceivableRows,
        totalReceivableMaskedUnits,
      },
    },
  };
}
