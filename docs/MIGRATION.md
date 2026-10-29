# Style Masters migration

Source: YCS Digital Color Palettes (`appKUu4QwquxPfjet`), CustomerDirectory (`tblUUHKa8OE2UCwWq`). The scope is the existing directory, not a new Shopify lookup or the unrelated Airtable Customers/ConsultantClients tables.
Destination: Gail's base `appVxYHy91v9JAh3Z`. Existing Table 1 is left alone.

The local demo uses invented customers and sample colors. Production migration progress and verification are recorded privately in `migration-private/import-manifest.json`.

## Prepared tools

- `node scripts/prepare-airtable.js`: preview destination schema. `--apply` creates missing tables using `AIRTABLE_TOKEN` with metadata write scope. It does not delete existing tables.
- `node scripts/export-source.js`: reads the source with a separate `SOURCE_AIRTABLE_TOKEN`, paginates every table, and creates private ignored snapshot/plan files. It does not write to either base. Run after verifying source scope/counts.
- `src/migration.js`: deterministic mappings based on directory record IDs; original customer IDs remain as historical references. Missing/duplicate source customer IDs stop conversion. All source fields and related history/quality records are retained in SourceArchive; photos, results, classifications, and reference assets have explicit mappings.

## Remaining cutover work

1. Review actual counts and migration warnings. Unknown/Legacy membership is mapped to None for review; active/inactive stays unchanged. Imported customers start with Client unchecked, because the directory has no client designation.
2. Configure Gail's Airtable and Cloudinary service credentials securely. Connector access alone is not a production API token.
3. Run `node scripts/import-destination.js` to preview the import, then use `node scripts/import-destination.js --apply` for the reviewed full import. The script implements resumable media copying into Gail's Cloudinary using deterministic public IDs and a URL map. Copy actual bytes for every original, adjusted, active, saved/report image and reference image. Preserve transforms and lip shapes. Replace URLs recursively, including archived source snapshots. Verify images before importing records; never present old account URLs as a completed transfer.
4. Import the reviewed plan idempotently into the destination. Guard against overwriting edits made in the new app during a rerun. Validate every mapped customer, source field, photo reference, and table count. Keep a rollback manifest of newly created records/images.
5. Test a small representative batch (active, inactive, missing color type, multiple photos, adjusted photos, saved images) against the live destination, then transfer the rest. Verify colors/categories and report assets from real reference tables; sample swatches must never go to production.
6. Schedule a brief source editing pause, export final changes, validate, and switch the URL. Do not delete source data or source image assets during cutover.

The SourceArchive table preserves historical data; old analytics are intentionally not rendered. The initial port does not migrate unrelated professional consultant clients, subscription billing, Shopify purchases, or user passwords. Reports associated only with unrelated consultant client IDs are outside the member-directory scope.

## Compact storage

Reference definitions are grouped by source table and historical originals by customer, with payloads capped at 70 KB before URL replacement. Every original ID and field is retained. The prepared full transfer uses 912 rows: 141 Customers, 520 Photos, 97 SavedImages, 13 ReferenceData groups, and 141 SourceArchive groups. Custom palettes and future records need additional capacity. This count excludes any existing starter-table rows. Airtable API usage limits apply separately.
