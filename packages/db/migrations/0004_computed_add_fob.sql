-- ============================================================================
-- Ayonz Costing App - migration 0004: expose fob_usd on costing_computed
--
-- The MYOB export needs the raw FOB USD figure. It is an input (not a
-- calculated value), but the EXPORT tab and CSV builder should read every field
-- from one source: the view. Recreate costing_computed identically to 0001 with
-- fob_usd carried through, so nothing reconstructs it from rounded figures.
--
-- Australian English. No em dashes.
-- ============================================================================

create or replace view costing_computed as
with base as (
  select
    c.id, c.sku, c.description, c.brand, c.vendor, c.fob_usd, c.duty_rate,
    c.payment_term, c.container_config, c.sell_ex_gst, c.rrp_inc_gst,
    c.licences, c.working_fx, c.final_fx, c.stage, c.status,
    r.units_20, r.units_40, r.units_40hc,
    r.freight_20_usd, r.freight_40_usd, r.freight_40hc_usd,
    r.destuff_aud, r.consultant_aud, r.ewaste_aud, r.gst_rate,
    r.finance_lc, r.finance_30, r.finance_60, r.finance_90,
    coalesce(c.final_fx, c.working_fx) as fx,
    (select coalesce(sum((l->>'usd')::numeric),0)
       from jsonb_array_elements(c.licences) l
       where (l->>'on')::boolean) as royalty_usd,
    case c.container_config
      when '20FT' then nullif(r.units_20,0)
      when '40FT' then nullif(r.units_40,0)
      else nullif(r.units_40hc,0) end as units,
    case c.container_config
      when '20FT' then r.freight_20_usd
      when '40FT' then r.freight_40_usd
      else r.freight_40hc_usd end as freight_ctr_usd,
    case c.payment_term
      when 'LC at sight' then r.finance_lc
      when 'TT 30 days'  then r.finance_30
      when 'TT 90 days'  then r.finance_90
      else r.finance_60 end as finance_rate
  from costings c
  join rate_cards r on r.id = c.rate_card_id
),
calc as (
  select *,
    (fob_usd + royalty_usd) / fx                       as exworks_aud,
    duty_rate * (fob_usd / fx)                          as duty_aud,
    (freight_ctr_usd / units) / fx                      as freight_aud,
    destuff_aud                                         as destuff_pu_aud
  from base
),
landed as (
  select *, (exworks_aud + duty_aud + freight_aud + destuff_pu_aud) as landed_aud
  from calc
),
loaded as (
  select *,
    (finance_rate * landed_aud)                         as finance_aud,
    landed_aud + (finance_rate * landed_aud) + consultant_aud + ewaste_aud as loaded_aud,
    rrp_inc_gst / (1 + gst_rate)                        as rrp_ex_gst
  from landed
)
select
  id, sku, description, brand, vendor, container_config, payment_term,
  fob_usd,
  fx, royalty_usd,
  round(exworks_aud,2)  as exworks_aud,
  round(duty_aud,2)     as duty_aud,
  round(freight_aud,2)  as freight_per_unit_aud,
  round(destuff_pu_aud,2) as destuff_per_unit_aud,
  round(landed_aud,2)   as landed_aud,
  round(finance_aud,2)  as finance_aud,
  round(consultant_aud,2) as consultant_aud,
  round(ewaste_aud,2)   as ewaste_aud,
  round(loaded_aud,2)   as loaded_aud,
  sell_ex_gst,
  round(sell_ex_gst - loaded_aud,2)                     as gross_profit_aud,
  round((sell_ex_gst - loaded_aud) / nullif(sell_ex_gst,0),4) as gp_pct,
  round(rrp_ex_gst,2)   as rrp_ex_gst,
  rrp_inc_gst,
  round((rrp_ex_gst - sell_ex_gst) / nullif(rrp_ex_gst,0),4)  as retailer_margin_pct,
  stage, status
from loaded;
