-- 04_shipment_extras.sql — run on the live project to add the two columns the
-- richer report import needs. Idempotent; safe to run and re-run. This is the
-- consolidation of packages/db/migrations/20260726000000_shipment_extras.sql.
--
-- agls   the batch references (AGL numbers) on a shipment. AGL is the tracking
--        key: a batch spans several containers and a container mixes several
--        AGLs, so the import prunes prior legs by this set (a new upload
--        overrides the previous entry for each AGL it carries).
-- notes  categorised free-form detail with no dedicated column: ETA-change
--        comments, transhipment notes, retailer notes, and any other cell
--        comment or unmapped column pulled off the sheet.

alter table visibility.shipments
  add column if not exists agls  text[] not null default '{}',
  add column if not exists notes jsonb  not null default '{}'::jsonb;

create index if not exists shipments_agls_idx
  on visibility.shipments using gin (agls);

notify pgrst, 'reload schema';
