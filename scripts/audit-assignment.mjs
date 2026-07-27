/**
 * Assignment audit: reads monday.com only and prints source-of-truth metrics.
 *
 *   node --env-file=.env.local scripts/audit-assignment.mjs
 */

const MONDAY_API_URL = "https://api.monday.com/v2";
const DEALS_BOARD_ID = 5030221367;
const WORK_ORDERS_BOARD_ID = 5030220660;

if (!process.env.MONDAY_TOKEN) {
  console.error("Missing MONDAY_TOKEN.");
  process.exit(1);
}

const BOARD_QUERY = `
  query BoardSnapshot($ids: [ID!]!) {
    boards(ids: $ids) {
      id
      name
      items_count
      columns { id title type }
      items_page(limit: 500) {
        items {
          id
          name
          column_values { id text type }
        }
      }
    }
  }
`;

function clean(value) {
  return String(value || "").trim();
}

function compact(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function numeric(value) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isJunkDeal(row) {
  const name = compact(row.name);
  return !name || name === "deal name" || Object.keys(row.values).length <= 1;
}

function isActiveWorkOrder(row) {
  const status = compact(row.values["Execution Status"]);
  return Boolean(status) && status !== "completed" && status !== "pause struck";
}

function normalizeBoard(board) {
  const titleById = new Map(board.columns.map((column) => [column.id, column.title]));
  return {
    id: Number(board.id),
    name: board.name,
    itemCount: board.items_count,
    rows: board.items_page.items.map((item) => {
      const values = {};
      for (const value of item.column_values) {
        const text = clean(value.text);
        if (text) values[titleById.get(value.id) || value.id] = text;
      }
      return { id: item.id, name: item.name, values };
    }),
  };
}

function addGroup(map, label, amount = 0) {
  const key = clean(label) || "Missing";
  const current = map.get(key) || { count: 0, maskedValueUnits: 0 };
  current.count += 1;
  current.maskedValueUnits += amount;
  map.set(key, current);
}

function sortedGroups(map) {
  return Array.from(map, ([label, value]) => ({ label, ...value })).sort(
    (a, b) => b.maskedValueUnits - a.maskedValueUnits,
  );
}

async function fetchSnapshot() {
  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      Authorization: process.env.MONDAY_TOKEN,
      "API-Version": "2026-07",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: BOARD_QUERY,
      variables: { ids: [String(DEALS_BOARD_ID), String(WORK_ORDERS_BOARD_ID)] },
    }),
  });

  const json = await response.json();
  if (!response.ok || json.errors?.length) {
    throw new Error(json.errors?.map((error) => error.message).join("; ") || `monday status ${response.status}`);
  }

  const boardsById = new Map(json.data.boards.map((board) => [Number(board.id), normalizeBoard(board)]));
  return {
    deals: boardsById.get(DEALS_BOARD_ID),
    workOrders: boardsById.get(WORK_ORDERS_BOARD_ID),
  };
}

const snapshot = await fetchSnapshot();
const openDeals = [];
const openBySector = new Map();
const activeWorkOrderNames = new Set();
let junkDeals = 0;
let closedOrNonOpenDeals = 0;
let missingOpenDealValue = 0;
let openMaskedValueUnits = 0;

for (const row of snapshot.deals.rows) {
  if (isJunkDeal(row)) {
    junkDeals += 1;
    continue;
  }
  if (compact(row.values["Deal Status"]) !== "open") {
    closedOrNonOpenDeals += 1;
    continue;
  }
  openDeals.push(row);
  const value = numeric(row.values["Masked Deal value"]);
  if (value === null) {
    missingOpenDealValue += 1;
  } else {
    openMaskedValueUnits += value;
    addGroup(openBySector, row.values["Sector/service"], value);
  }
}

for (const row of snapshot.workOrders.rows) {
  if (isActiveWorkOrder(row)) {
    const name = clean(row.values["Deal name masked"] || row.name);
    if (name) activeWorkOrderNames.add(name);
  }
}

const gapBySector = new Map();
for (const row of openDeals) {
  if (!activeWorkOrderNames.has(clean(row.name))) {
    addGroup(gapBySector, row.values["Sector/service"], numeric(row.values["Masked Deal value"]) || 0);
  }
}

const receivables = snapshot.workOrders.rows
  .map((row) => ({
    deal: clean(row.values["Deal name masked"] || row.name),
    customer: clean(row.values["Customer Name Code"]) || "Missing customer",
    sector: clean(row.values["Sector"]) || "Missing sector",
    amount: numeric(row.values["Amount Receivable (Masked)"]) || 0,
  }))
  .filter((row) => row.amount > 0)
  .sort((a, b) => b.amount - a.amount);

const unbilled = snapshot.workOrders.rows
  .map((row) => ({
    deal: clean(row.values["Deal name masked"] || row.name),
    customer: clean(row.values["Customer Name Code"]) || "Missing customer",
    sector: clean(row.values["Sector"]) || "Missing sector",
    amount:
      numeric(row.values["Amount to be billed in Rs. (Incl. of GST) (Masked)"]) ||
      numeric(row.values["Amount to be billed in Rs. (Exl. of GST) (Masked)"]) ||
      0,
  }))
  .filter((row) => row.amount > 0)
  .sort((a, b) => b.amount - a.amount);

console.log(
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      boards: {
        deals: {
          name: snapshot.deals.name,
          fetchedRows: snapshot.deals.rows.length,
          dashboardRows: snapshot.deals.itemCount,
        },
        workOrders: {
          name: snapshot.workOrders.name,
          fetchedRows: snapshot.workOrders.rows.length,
          dashboardRows: snapshot.workOrders.itemCount,
        },
      },
      assignmentChecks: {
        pipelineHealth: {
          openDeals: openDeals.length,
          openDealsWithValue: openDeals.length - missingOpenDealValue,
          openMaskedValueUnits,
          exclusions: { junkDeals, closedOrNonOpenDeals, missingOpenDealValue },
          openBySector: sortedGroups(openBySector),
        },
        billingRisk: {
          receivableRows: receivables.length,
          topReceivables: receivables.slice(0, 5),
          unbilledRows: unbilled.length,
          topUnbilled: unbilled.slice(0, 5),
        },
        crossBoardGaps: {
          activeWorkOrderDealNames: activeWorkOrderNames.size,
          openDealsWithoutActiveWorkOrder: Array.from(gapBySector.values()).reduce((sum, item) => sum + item.count, 0),
          sectorsWithOpenDealsButNoActiveWorkOrders: sortedGroups(gapBySector),
        },
      },
    },
    null,
    2,
  ),
);
