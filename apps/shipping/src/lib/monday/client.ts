import type { MondayBoard, MondayItem } from "./types";

const MONDAY_ENDPOINT = "https://api.monday.com/v2";
const DEFAULT_PAGE_SIZE = 100;
const MAX_ATTEMPTS = 4;

const ITEM_FIELDS = `
  id
  name
  created_at
  updated_at
  group { id title }
  column_values { id text type value }
  assets { id name url public_url file_extension file_size }
`;

const FIRST_PAGE_QUERY = `
  query BoardItems($boardId: ID!, $limit: Int!) {
    boards(ids: [$boardId]) {
      id
      name
      items_page(limit: $limit) {
        cursor
        items { ${ITEM_FIELDS} }
      }
    }
  }
`;

const NEXT_PAGE_QUERY = `
  query NextBoardItems($cursor: String!, $limit: Int!) {
    next_items_page(cursor: $cursor, limit: $limit) {
      cursor
      items { ${ITEM_FIELDS} }
    }
  }
`;

type GraphQLError = {
  message: string;
  extensions?: { code?: string; retry_in_seconds?: number };
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

type ItemsPage = {
  cursor: string | null;
  items: MondayItem[];
};

function requireServer() {
  if (typeof window !== "undefined") {
    throw new Error("The Monday API client is server-only.");
  }
}

function getToken(): string {
  const token = process.env.MONDAY_API_TOKEN?.trim();
  if (!token) throw new Error("MONDAY_API_TOKEN is not configured.");
  return token;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1_000;
  }
  const exponential = Math.min(1_000 * 2 ** attempt, 15_000);
  return exponential + Math.floor(Math.random() * 250);
}

async function requestMonday<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  requireServer();
  const apiVersion = process.env.MONDAY_API_VERSION?.trim();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(MONDAY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: getToken(),
        "Content-Type": "application/json",
        ...(apiVersion ? { "API-Version": apiVersion } : {}),
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });

    const payload = (await response.json()) as GraphQLResponse<T>;
    const retryAfterHeader = Number(response.headers.get("retry-after") || "0");
    const retryableStatus = response.status === 429 || response.status >= 500;
    const retryableError = payload.errors?.find((error) =>
      ["COMPLEXITY_EXCEPTION", "RATE_LIMIT_EXCEEDED", "INTERNAL_SERVER_ERROR"].includes(
        error.extensions?.code || "",
      ),
    );

    if ((retryableStatus || retryableError) && attempt < MAX_ATTEMPTS - 1) {
      await wait(
        retryDelay(
          attempt,
          retryAfterHeader || retryableError?.extensions?.retry_in_seconds,
        ),
      );
      continue;
    }

    if (!response.ok) {
      throw new Error(`Monday API HTTP ${response.status}`);
    }
    if (payload.errors?.length) {
      throw new Error(
        `Monday API: ${payload.errors.map((error) => error.message).join("; ")}`,
      );
    }
    if (!payload.data) throw new Error("Monday API returned no data.");
    return payload.data;
  }

  throw new Error("Monday API request exhausted retries.");
}

export async function fetchMondayBoard(
  boardId: string,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<MondayBoard> {
  const limit = Math.max(1, Math.min(pageSize, 500));
  const first = await requestMonday<{
    boards: Array<{ id: string; name: string; items_page: ItemsPage }>;
  }>(FIRST_PAGE_QUERY, { boardId, limit });

  const board = first.boards[0];
  if (!board) {
    throw new Error(`Monday board ${boardId} was not found or is not accessible.`);
  }

  const items = [...board.items_page.items];
  let cursor = board.items_page.cursor;
  while (cursor) {
    const next = await requestMonday<{ next_items_page: ItemsPage }>(
      NEXT_PAGE_QUERY,
      { cursor, limit },
    );
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }

  return { id: board.id, name: board.name, items };
}
