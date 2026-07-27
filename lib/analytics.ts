import type { MondaySnapshot, SnapshotRow } from "./monday";

function clean(value?: string) {
  return (value || "").trim();
}

function lower(value?: string) {
  return clean(value).toLowerCase();
}

function compact(value?: string) {
  return lower(value).replace(/[^a-z0-9]+/g, " ").trim();
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

function addCount(groups: Map<string, number>, key: string) {
  const label = key || "Missing";
  groups.set(label, (groups.get(label) || 0) + 1);
}

function sortedCounts(groups: Map<string, number>) {
  return Array.from(groups, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function normalizeBillingStatus(value?: string) {
  const status = compact(value);
  if (!status) return "Missing";
  if (status === "billed" || status === "fully billed") return "Billed";
  if (status === "partially billed" || status === "partial billed") return "Partially billed";
  if (status === "not billable") return "Not billable";
  if (status === "update required") return "Update required";
  if (status === "stuck") return "Stuck";
  if (status === "not billed yet" || status === "not billed") return "Not billed";
  return clean(value);
}

function isActiveWorkOrder(row: SnapshotRow) {
  const status = compact(row.values["Execution Status"]);
  if (!status) return false;
  if (status === "completed" || status === "pause struck") return false;
  return true;
}

function positiveOrNull(value?: string) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function amountToBill(row: SnapshotRow) {
  return (
    positiveOrNull(row.values["Amount to be billed in Rs. (Incl. of GST) (Masked)"]) ??
    positiveOrNull(row.values["Amount to be billed in Rs. (Exl. of GST) (Masked)"]) ??
    positiveOrNull(row.values["Amount to be billed in Rs. (Excl. of GST) (Masked)"])
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
  const openDealNames = new Set<string>();
  const openDealNameCounts = new Map<string, number>();
  const openDealRows: SnapshotRow[] = [];

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
    openDealRows.push(row);
    const dealName = clean(row.name);
    if (dealName) {
      openDealNames.add(dealName);
      openDealNameCounts.set(dealName, (openDealNameCounts.get(dealName) || 0) + 1);
    }

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

  const billingStatusCountsRaw = new Map<string, number>();
  const billingStatusCountsNormalized = new Map<string, number>();
  const executionStatusCounts = new Map<string, number>();
  const activeWorkOrderDealNames = new Set<string>();
  const workOrderDealNames = new Set<string>();
  const activeWorkOrderDealNamesWithoutOpenDeal = new Set<string>();
  let receivableRows = 0;
  let totalReceivableMaskedUnits = 0;
  let missingReceivableRows = 0;
  let activeWorkOrders = 0;
  let inactiveOrMissingExecutionStatus = 0;
  let negativeAmountToBillRows = 0;
  let negativeReceivableRows = 0;
  const topReceivables: Array<{
    deal: string;
    customer: string;
    sector: string;
    status: string;
    maskedReceivableUnits: number;
  }> = [];
  const topUnbilled: Array<{
    deal: string;
    customer: string;
    sector: string;
    billingStatus: string;
    maskedAmountToBillUnits: number;
  }> = [];

  for (const row of snapshot.boards.workOrders.rows) {
    const billingStatus = clean(row.values["Billing Status"]) || clean(row.values["Invoice Status"]) || "Missing";
    addCount(billingStatusCountsRaw, billingStatus);
    addCount(billingStatusCountsNormalized, normalizeBillingStatus(billingStatus));

    const executionStatus = clean(row.values["Execution Status"]) || "Missing";
    addCount(executionStatusCounts, executionStatus);

    const dealName = clean(row.values["Deal name masked"] || row.name);
    if (dealName) workOrderDealNames.add(dealName);
    if (isActiveWorkOrder(row)) {
      activeWorkOrders += 1;
      if (dealName) {
        activeWorkOrderDealNames.add(dealName);
        if (!openDealNames.has(dealName)) activeWorkOrderDealNamesWithoutOpenDeal.add(dealName);
      }
    } else {
      inactiveOrMissingExecutionStatus += 1;
    }

    const receivable = numeric(row.values["Amount Receivable (Masked)"]);
    if (receivable === null) {
      missingReceivableRows += 1;
    } else if (receivable < 0) {
      negativeReceivableRows += 1;
    } else {
      receivableRows += 1;
      totalReceivableMaskedUnits += receivable;
      if (receivable > 0) {
        topReceivables.push({
          deal: dealName || row.name,
          customer: clean(row.values["Customer Name Code"]) || "Missing customer",
          sector: clean(row.values["Sector"]) || "Missing sector",
          status: normalizeBillingStatus(billingStatus),
          maskedReceivableUnits: receivable,
        });
      }
    }

    const billableAmount = amountToBill(row);
    if (billableAmount !== null) {
      topUnbilled.push({
        deal: dealName || row.name,
        customer: clean(row.values["Customer Name Code"]) || "Missing customer",
        sector: clean(row.values["Sector"]) || "Missing sector",
        billingStatus: normalizeBillingStatus(billingStatus),
        maskedAmountToBillUnits: billableAmount,
      });
    }

    const rawAmountToBill =
      numeric(row.values["Amount to be billed in Rs. (Incl. of GST) (Masked)"]) ??
      numeric(row.values["Amount to be billed in Rs. (Exl. of GST) (Masked)"]) ??
      numeric(row.values["Amount to be billed in Rs. (Excl. of GST) (Masked)"]);
    if (rawAmountToBill !== null && rawAmountToBill < 0) {
      negativeAmountToBillRows += 1;
    }
  }

  topReceivables.sort((a, b) => b.maskedReceivableUnits - a.maskedReceivableUnits);
  topUnbilled.sort((a, b) => b.maskedAmountToBillUnits - a.maskedAmountToBillUnits);

  const openDealsWithoutActiveWorkOrder = openDealRows.filter((row) => {
    const name = clean(row.name);
    return name && !activeWorkOrderDealNames.has(name);
  });
  const gapsBySector = new Map<string, { count: number; maskedValueUnits: number }>();
  for (const row of openDealsWithoutActiveWorkOrder) {
    addGroup(
      gapsBySector,
      clean(row.values["Sector/service"]) || "Missing sector",
      numeric(row.values["Masked Deal value"]) || 0,
    );
  }

  const duplicateOpenDealNames = Array.from(openDealNameCounts, ([deal, count]) => ({ deal, count }))
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count || a.deal.localeCompare(b.deal));

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
      duplicateOpenDealNames: duplicateOpenDealNames.slice(0, 12),
    },
    workOrders: {
      totalWorkOrderRows: snapshot.boards.workOrders.itemCount,
      fetchedWorkOrderRows: snapshot.boards.workOrders.fetchedCount,
      activeWorkOrders,
      inactiveOrMissingExecutionStatus,
      billingStatusCountsRaw: sortedCounts(billingStatusCountsRaw),
      billingStatusCountsNormalized: sortedCounts(billingStatusCountsNormalized),
      executionStatusCounts: sortedCounts(executionStatusCounts),
      receivables: {
        rowsWithReceivable: receivableRows,
        missingReceivableRows,
        negativeReceivableRows,
        totalReceivableMaskedUnits,
        topReceivables: topReceivables.slice(0, 10),
      },
      unbilled: {
        rowsWithAmountToBill: topUnbilled.length,
        negativeAmountToBillRows,
        totalAmountToBillMaskedUnits: topUnbilled.reduce((sum, row) => sum + row.maskedAmountToBillUnits, 0),
        topUnbilled: topUnbilled.slice(0, 10),
      },
    },
    crossBoard: {
      joinKey: "Deal Name -> Deal name masked, exact trimmed masked string",
      openDealNames: openDealNames.size,
      workOrderDealNames: workOrderDealNames.size,
      activeWorkOrderDealNames: activeWorkOrderDealNames.size,
      activeWorkOrders,
      openDealsWithoutActiveWorkOrder: openDealsWithoutActiveWorkOrder.length,
      sectorsWithOpenDealsButNoActiveWorkOrders: sortedGroups(gapsBySector),
      sampleOpenDealsWithoutActiveWorkOrder: openDealsWithoutActiveWorkOrder.slice(0, 12).map((row) => ({
        deal: row.name,
        sector: clean(row.values["Sector/service"]) || "Missing sector",
        stage: clean(row.values["Deal Stage"]) || "Missing stage",
        maskedValueUnits: numeric(row.values["Masked Deal value"]),
      })),
      activeWorkOrderDealNamesWithoutOpenDeal: Array.from(activeWorkOrderDealNamesWithoutOpenDeal).sort().slice(0, 12),
      caveats: {
        duplicateOpenDealNames: duplicateOpenDealNames.length,
        inactiveOrMissingExecutionStatus,
      },
    },
  };
}

export type AnalyticsSummary = ReturnType<typeof buildAnalyticsSummary>;
