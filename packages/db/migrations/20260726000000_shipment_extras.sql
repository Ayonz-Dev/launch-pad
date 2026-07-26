-- Shipment extras — everything the daily report carries beyond the core columns,
-- captured on import and categorised. Depends on 20260715025400_shipment_visibility.sql.
--
-- Two additions to visibility.shipments:
--   agls   the batch references (AGL numbers) carried on the shipment. AGL is the
--          common tracking key: a batch spans several containers and a container
--          mixes several AGLs, so we keep the set here and prune by it on re-import
--          (new upload overrides the previous entry for each AGL).
--   notes  categorised, free-form detail that has no dedicated column: ETA-change
--          comments (why a date moved), transhipment notes, retailer notes, and any
--          other cell comment or unmapped column pulled off the sheet.
--
-- Idempotent: safe to run and re-run on the live project.

alter table visibility.shipments
  add column if not exists agls  text[] not null default '{}',
  add column if not exists notes jsonb  not null default '{}'::jsonb;

-- Used by the import route to find and prune the prior legs of every AGL in an
-- upload, and by the AGL tracking view.
create index if not exists shipments_agls_idx
  on visibility.shipments using gin (agls);
