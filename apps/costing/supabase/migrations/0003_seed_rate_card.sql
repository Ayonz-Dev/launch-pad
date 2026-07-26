-- ============================================================================
-- Ayonz Costing App - migration 0003: a default rate card
--
-- The costings table requires a rate_card_id, so a fresh project needs at least
-- one rate card to create a costing against. These are the same assumptions the
-- original on-screen sheet shipped with. Adjust in the Settings screen.
--
-- Australian English. No em dashes.
-- ============================================================================

insert into rate_cards (
  name, is_default,
  units_20, units_40, units_40hc,
  freight_20_usd, freight_40_usd, freight_40hc_usd,
  destuff_aud, consultant_aud, ewaste_aud, gst_rate,
  finance_lc, finance_30, finance_60, finance_90
)
select
  'Standard rate card', true,
  800, 1700, 1800,
  3100, 5900, 6444,
  0.35, 3.50, 1.137, 0.10,
  0.02, 0.04, 0.06, 0.08
where not exists (select 1 from rate_cards where is_default);
