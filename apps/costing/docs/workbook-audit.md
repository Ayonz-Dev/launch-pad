# Source workbook audit

Source: `AGLXXX000_Costing_Template.xlsx`, reviewed 15 July 2026.

## Workbook structure

| Sheet | Purpose | Finding |
|---|---|---|
| `INPUTS` | Product, commercial, pricing, customer, delivery, and approval inputs | Strong basis for the app's guided quote flow. |
| `Sheet1` | Factory quote, freight, landed cost, PO allocation, approval | A separate general import-costing model with useful landed-cost logic. |
| `RATES` | FX, duty, logistics, and account references | Rows 5–45 contain valid reference data; the later calculation engine referenced by `INPUTS` is missing. |
| `EXPORT` | MYOB Acumatica contract and validation | Useful field contract and approval checks; several outputs depend on missing `RATES` cells. |

## Material formula issues

- `INPUTS!B12` and `EXPORT!B18` reference `RATES!B42`, which currently contains the text `Freight & Cartage`, not an exchange rate.
- Calculations reference blank cells including `RATES!C66`, `B71`, `C75:E75`, `C80:E81`, `C93:E100`.
- Only `RATES!C101:E101` remains from the later container calculation block, so the workbook's costing summary currently resolves to zero, text, or `TBC` for core outputs.
- The workbook combines two costing models with different assumptions: CBM/KG shipment costing on `Sheet1` and container-configuration costing on `INPUTS`/`EXPORT`.

## App interpretation

The app uses one explicit, auditable calculation sequence:

1. Manufacturer unit cost plus licences and allocated fixed order fees.
2. Convert foreign factory value to AUD.
3. Round physical containers up based on order quantity and units per container.
4. Add freight and marine insurance to determine CIF.
5. Add duty, customs, biosecurity, wharf charges, and cartage.
6. Add internal overhead to determine fully loaded unit cost.
7. Deduct all customer trading terms from sell price to determine net sales.
8. Calculate net GP and retailer margin on RRP excluding GST.

Inputs that were absent or incomplete in the workbook are visible assumptions in the app rather than hidden constants.
