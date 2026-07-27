import {
  DEALS_BOARD,
  DEALS_BOARD_ID,
  MONDAY_API_URL,
  WORK_ORDERS_BOARD,
  WORK_ORDERS_BOARD_ID,
} from "./config";

type MondayColumnValue = {
  id: string;
  text: string | null;
  type: string;
};

type MondayItem = {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
};

type MondayBoardResponse = {
  id: string;
  name: string;
  items_count: number;
  columns: Array<{ id: string; title: string; type: string }>;
  items_page: { items: MondayItem[] };
};

export type SnapshotRow = {
  id: string;
  name: string;
  values: Record<string, string>;
};

export type BoardSnapshot = {
  id: number;
  expectedName: string;
  liveName: string;
  itemCount: number;
  fetchedCount: number;
  columns: Array<{ id: string; title: string; type: string }>;
  rows: SnapshotRow[];
};

export type MondaySnapshot = {
  fetchedAt: string;
  boards: {
    deals: BoardSnapshot;
    workOrders: BoardSnapshot;
  };
};

const BOARD_QUERY = `
  query BoardSnapshot($ids: [ID!]!) {
    boards(ids: $ids) {
      id
      name
      items_count
      columns {
        id
        title
        type
      }
      items_page(limit: 500) {
        items {
          id
          name
          column_values {
            id
            text
            type
          }
        }
      }
    }
  }
`;

function tokenHeaders(token: string) {
  return {
    Authorization: token,
    "API-Version": "2026-07",
    "Content-Type": "application/json",
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mondayGraphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(MONDAY_API_URL, {
        method: "POST",
        headers: tokenHeaders(token),
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as
        | { data?: T; errors?: Array<{ message?: string }> }
        | null;

      if (!res.ok || !json) {
        throw new Error(`monday.com API request failed with status ${res.status}.`);
      }

      if (json.errors?.length) {
        throw new Error(json.errors.map((error) => error.message || "Unknown monday.com error").join("; "));
      }

      if (!json.data) {
        throw new Error("monday.com API returned no data.");
      }

      return json.data;
    } catch (err) {
      lastError = err;
      if (attempt < 3) await wait(attempt * 400);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("monday.com API request failed.");
}

function normalizeBoard(board: MondayBoardResponse, expectedName: string): BoardSnapshot {
  const columnTitleById = new Map(board.columns.map((column) => [column.id, column.title]));

  return {
    id: Number(board.id),
    expectedName,
    liveName: board.name,
    itemCount: board.items_count,
    fetchedCount: board.items_page.items.length,
    columns: board.columns,
    rows: board.items_page.items.map((item) => {
      const values: Record<string, string> = {};
      for (const value of item.column_values) {
        const text = value.text?.trim();
        if (!text) continue;
        values[columnTitleById.get(value.id) || value.id] = text;
      }
      return { id: item.id, name: item.name, values };
    }),
  };
}

export async function fetchMondaySnapshot(token: string): Promise<MondaySnapshot> {
  const data = await mondayGraphql<{ boards: MondayBoardResponse[] }>(token, BOARD_QUERY, {
    ids: [String(DEALS_BOARD_ID), String(WORK_ORDERS_BOARD_ID)],
  });

  const boardsById = new Map(data.boards.map((board) => [Number(board.id), board]));
  const deals = boardsById.get(DEALS_BOARD_ID);
  const workOrders = boardsById.get(WORK_ORDERS_BOARD_ID);

  if (!deals || !workOrders) {
    throw new Error("Could not read both required monday.com boards.");
  }

  return {
    fetchedAt: new Date().toISOString(),
    boards: {
      deals: normalizeBoard(deals, DEALS_BOARD),
      workOrders: normalizeBoard(workOrders, WORK_ORDERS_BOARD),
    },
  };
}

export function formatSnapshotForPrompt(snapshot: MondaySnapshot): string {
  return JSON.stringify({
    fetchedAt: snapshot.fetchedAt,
    boards: {
      deals: {
        id: snapshot.boards.deals.id,
        liveName: snapshot.boards.deals.liveName,
        itemCount: snapshot.boards.deals.itemCount,
        fetchedCount: snapshot.boards.deals.fetchedCount,
        rows: snapshot.boards.deals.rows,
      },
      workOrders: {
        id: snapshot.boards.workOrders.id,
        liveName: snapshot.boards.workOrders.liveName,
        itemCount: snapshot.boards.workOrders.itemCount,
        fetchedCount: snapshot.boards.workOrders.fetchedCount,
        rows: snapshot.boards.workOrders.rows,
      },
    },
  });
}
