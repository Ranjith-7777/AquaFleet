# Interaction patterns

Every register page implements the same interaction contract. Behaviour, not just appearance, must carry over.

## Search
Header search pill filters the loaded collection **client-side, case-insensitive, across all displayed
string/number fields** (the existing app already holds the collection in state). Filtering updates the row
count chip, the pagination label and the empty state. It does **not** clear the current filter chip.

## Filter chips
Segmented control over a single field (status, risk, health, custody…). `All` plus the enum values.
Chips and search compose with AND. On pages with no meaningful enum (junction tables) the control is omitted
— do not invent one.

## Row selection → detail panel
Clicking anywhere on a row selects it: row gets `#f1f9fc` + `inset 3px 0 0 #54c3e0`, and the right-hand
detail panel re-renders for that record. First row is selected by default on load. Selection survives
search/filter changes where the record is still visible; if it is filtered out, fall back to the first
visible row. Selection is view state only — no request.

## Linked records
The detail panel's linked list shows related rows from an adjacent entity (expeditions for a vessel, missions
for a zone, aliquots for a sample…). When the relation has no rows, show the single muted placeholder line
defined per page rather than an empty area.

## CRUD
- **Add** — header primary button opens the create modal built from the existing `master-data.js` field metadata.
- **Edit** — row link and detail-panel primary button open the same modal in edit mode; immutable fields
  (composite keys, weak-entity numbers) are omitted, exactly as `activeFields()` already does.
- **Delete** — row link and detail-panel destructive button open the confirmation dialog. Server-side
  restrictions (`ON DELETE RESTRICT`, workflow rules) surface as the failure toast with the API's message and
  "No data was deleted." Never force-delete.
- Success closes the modal, refreshes the collection, shows the success toast.
- Validation errors mark fields inline and show the modal-level alert; the existing 400 `errors` map drives both.

## Permissions
All create/edit/delete affordances are gated by `permissions.js`. When a role cannot perform an action the
control is **hidden**, not disabled, and the page shows the read-only chip in the restricted state.

## Pagination
Footer pager over the filtered set, with the mono range label (`Showing 1–N of M records`). Page size follows
the existing Research Vessels implementation. Reset to page 1 whenever search or filter changes.

## Section tabs
Plain navigation between sibling pages of the same rail group; no state is carried across.

## Reports
Tab selects the SQL view; the filter chip maps to that report's existing query parameter; Refresh re-runs the
query; the context rail shows the returned row count. Reports are read-only — no row selection, no CRUD.
"Export CSV" is **BACKEND MAPPING REQUIRED**.

## Loading / error
Any collection fetch shows the skeleton state inside the table card; navigation and the rail stay interactive.
A failed fetch shows the error block with Retry; the sidebar and header remain usable, matching current behaviour.

## Responsive
Desktop-first; verified at 1366×768, 1440×900 and 1920×1080.
- The page never scrolls: table and detail panel scroll internally.
- KPI strip reflows via `auto-fit minmax(232px,1fr)`.
- Below roughly 1200px the detail panel wraps under the table card (`flex-wrap`), full width.
- Header controls wrap as a group; the primary action must never be pushed off-screen or wrap its label.
- Table columns use `minmax()` text tracks plus fixed numeric tracks; all text cells ellipsise rather than wrap.
