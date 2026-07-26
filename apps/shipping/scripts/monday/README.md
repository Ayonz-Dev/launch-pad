# Monday product catalogue sync

Monday remains the operational source of truth. This sync creates a normalized
Supabase read model for sourcing, procurement, artwork and social-media search.
It stores Monday file metadata and links, but does not download file contents.

## One-time setup

1. Run `supabase/sourcing_toolkit_schema.sql` against the canonical shared
   project `https://jhhorikmpftvzlawcuty.supabase.co`. The script is additive
   and creates the Monday mirror tables.
2. Set the server-only variables shown in `.env.example` in `.env.local`.
3. Keep the personal Monday token out of Git and browser-exposed variables.

The board roles are:

- `MONDAY_ARTWORK_BOARD_ID`: active Artwork List
- `MONDAY_COMPLETED_ARTWORK_BOARD_ID`: completed artwork history
- `MONDAY_SOCIAL_MEDIA_BOARD_ID`: social content

`MONDAY_PRODUCTS_BOARD_ID` is accepted temporarily as an alias for the completed
artwork board.

## Validate before writing

```bash
npm run catalog:sync:monday -- --dry-run
```

The dry run reads all three boards, merges products by normalized AGL, checks
social links and prints counts plus review issues. It does not connect to or
write Supabase.

## Synchronize

```bash
npm run catalog:sync:monday
```

The write sync is idempotent:

- canonical products are keyed by normalized AGL;
- Monday source, social and asset rows are keyed by board/item identifiers;
- active artwork values take precedence over completed values when non-empty;
- unmatched or ambiguous records are written to
  `monday_catalog_sync_errors` for review.

Writes use bounded concurrency (8 by default). Set
`MONDAY_SYNC_CONCURRENCY=1` for sequential troubleshooting or up to `16` for a
faster sync.

Run the command manually until the dry-run and write counts are accepted.
Scheduling and Monday webhooks are intentionally deferred.

## Mapping tests

```bash
npm run test:monday-mapping
```
