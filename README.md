# Style Masters Admin Dashboard

Standalone extraction of the MY YCS professional client workflow, using Gail's own Airtable and Cloudinary accounts. No Shopify login, store API, sync, or membership analytics.

## Local preview

Node.js 22 or later:

```sh
npm ci
npm run demo
```

Open http://127.0.0.1:4317/clients. This uses invented sample customers and explicitly labeled sample colors. Edits persist only in ignored `.local/` files. The demo never uses an Airtable token and cannot run on Vercel, in production mode, or on a non-loopback hostname.

## Included

- Original MY YCS My Clients screens, styles, client editing, photo management, studio navigation, and report builder, adapted to Clients & Members.
- Independent Active / Inactive / None membership and Client checkbox. All Customers, My Clients, All Members, Active Members, Inactive Members filters, plus search and sorting.
- Photo Prep, original and adjusted uploads, saved photo selection, Structured Analysis, Lip & Draping Studio, transforms/lip masks, saved studio images, report drafts, and custom studio palettes.
- Owner login with a scrypt password hash and signed HttpOnly session cookie. Server authorization is independent of display flags. Cross-origin writes are rejected.
- No YCS logo. Existing studio/reference graphics are vendored locally; provenance is in docs/asset-provenance.json.
- Airtable storage adapter, schema preview/provisioning, read-only source export, pure migration mapping, and resumable destination import/media-copy scripts.

## Production setup

1. In Gail's Vercel team, connect `gailscottstyle/style-masters-admin`. Build: `npm run build`. Node runtime: 22 or later. The Vercel function and routing are in `api/index.js` and `vercel.json`.
2. Configure environment variables from `.env.example`. Set `DEMO_MODE=false`; configure only Gail's Airtable and Cloudinary service credentials. The destination base is guarded to prevent writes to the YCS source.
3. Run `npm run password` locally in an interactive terminal. It reads a new password without echo and outputs the hash and session secret for Vercel's secure environment fields. Gail keeps the password. Default administrator email: gailscottstyle@gmail.com. Changing the session secret revokes all sessions.
4. Configure Vercel rate limiting for POST /login before a public launch. Only a single owner login is included in this initial port; staff invitations, password reset email, and MFA are not implemented.
5. Automatic background removal is optional and needs Gail's own `REMOVE_BG_API_KEY`. Without it, the checkbox is disabled and original uploads/color adjustments work normally.
6. Provision the reviewed Airtable schema, verify counts/media and import the final source data as described in docs/MIGRATION.md. Do not seed sample swatches in production.
7. Verify the Vercel deployment's login, authenticated routes, uploads, real colors, reports, photo selection, and mobile layout using the configured destination accounts before cutover.

## Data model

Customers, Photos, SavedImages, Reports, ReferenceData, SourceArchive, and CustomPalettes each have a durable Key plus a Data JSON payload. Customers also exposes Name, Email, MembershipStatus, IsClient, and ColorType as Airtable fields. MembershipStatus and IsClient edits in Airtable are authoritative; edit other customer details through the app to keep the payload synchronized. Server requests paginate all records.

ReferenceData and SourceArchive use versioned JSON groups to preserve all original entries in fewer Airtable rows. The application expands reference groups when reading palette colors and report templates. Migration writes are batched in groups of ten records.

Deleting a customer or saved image in the initial application archives it; physical images/source snapshots are retained. There is no automatic source deletion.

## Validation

```sh
npm run build
npm test
```

Tests cover authentication and production demo guards, classification persistence, cross-origin protection, uploads/adjustments/selection, studio image and report storage, source-base protection, screen compilation, and migration preservation/scope. Live Airtable writes, Cloudinary transfers, remove.bg, and Vercel deployment require credentials and separate integration verification.

## Source provenance

The four templates and three studio/client scripts were adapted from the local MY YCS working tree on October 27, 2026, including its uncommitted client/report improvements. Original source remains untouched. Liquid is used only at build time to preserve the inherited presentation; the deployed application has no Shopify dependency. Preserved internal `ycs-` CSS/DOM identifiers are compatibility hooks, not access controls.

## Dashboard and palettes

The home page has exactly two cards: Clients & Members and Color Palettes. The palette hub, collection, custom palette editor, color fan, and color detail UI are adapted from the newer My YCS professional screens in the client-multiple-photos checkout. All calls use the standalone authenticated backend. Custom colors and palettes support editing, assignments, ordering, CSV creation/append, and archival; favorites are stored independently by palette. Original YCS logos and storefront dependencies are removed. Missing depth metadata does not hide a color.

The local preview uses sample colors. The actual YCS reference colors must be migrated before production palette review. The current extracted Trade editor does not provide public client share links; adding the handoff document's newer public sharing flow remains a separate parity item.

## Vercel setup message

“Style Masters setup is not complete” is returned intentionally until `ADMIN_PASSWORD_HASH`, a `SESSION_SECRET` of at least 32 characters, and `AIRTABLE_TOKEN` are configured. Use Gail's destination Airtable token, with record read/write and schema read/write permissions restricted to the destination base. Create the destination tables with `scripts/prepare-airtable.js --apply` before loading customer or palette data. Add Gail's Cloudinary settings before uploading photos. Environment changes require a new deployment. Never enable sample mode as a production workaround.
