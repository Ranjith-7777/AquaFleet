# AquaFleet routed UI implementation plan

Status: **architecture proposal only; implementation awaits approval**. Planning inputs: `BACKEND_MAPPING_AUDIT.md`, this handoff's README, design-system and page-design specifications, and the 23 frozen `.dc.html` artifacts. The artifacts govern appearance and interaction; the existing database, Flask routes, and API responses govern data and behavior. Research Vessels is the working frontend baseline. The six product decisions in the approved brief supersede the audit's earlier open questions.

## 1. Current frontend architecture

`frontend/index.html` loads deferred classic scripts in dependency order; there is no bundler or component framework. `api.js` owns authenticated HTTP and session failure handling; `auth.js` owns session boot and login; `ui.js` owns safe DOM construction, formatters, badges, alerts, modal, and basic states. `resources.js` defines the 19 resource keys, routes, columns, and details. `permissions.js` mirrors role capabilities for display. `master-data.js` owns form metadata, validation, relation choices, composite record paths, and create/edit/delete modals. `reporting.js` owns the five read-only SQL-view reports. `landing.js` and `landing.css` own the public view.

`app.js` (~1,070 lines) presently owns authenticated navigation, global search, health, Dashboard, the finished Research Vessels register/detail workspace, legacy generic resource table/detail rendering, and the Reports entry point. `style.css` (~380 densely written lines) contains authenticated shell, legacy resource, Dashboard, and vessel rules. `frontend/tests/phase1.test.js`, `phase2.test.js`, and `dashboard.test.js` are the existing regression baseline.

The 21 routed pages are Dashboard (01), 19 resources (02–20), and Reports (21). Interface States (22) and Design Index (23) are reference artifacts, not routes. Dashboard and Research Vessels already use their approved visual compositions; the other 18 resource routes still enter the generic renderer.

## 2. Scaling problems

- Adding 18 separate renderers inside `app.js` would multiply navigation, search, CRUD callbacks, state and DOM logic. Expanding `style.css` similarly would create broad selectors and visual regressions.
- Vessel code provides proven behavior but contains vessel-specific deployment inference, expeditions, columns and detail composition. Copying the whole block would duplicate policy and bugs; rewriting it now would risk a working page.
- A successful empty related collection differs from a failed related request. Coercing both to `[]` could report false zero KPIs or imply an asset was inspected.
- Global search and async refresh can race navigation or mutations. A later response must not render on the wrong route; filters and selection must remain coherent after CRUD.
- Several designs use illustrative status labels or incomplete enum chips. Rendering those directly would assert unsupported business rules. The full API enums and the six approved decisions must control the copy.
- Related collections can be joined by IDs in the browser, but repeated network calls per search or selection would be wasteful and inconsistent.

## 3. Shared UI architecture

Keep the existing classic-script/global namespace pattern and Bootstrap. Add a small `AquaFleetWorkspace` controller for the **new** resource workspaces. It receives a page descriptor registered by grouped page modules. Each descriptor declares resource key, primary/related collections, row ID, search fields, filters, KPI selectors, table columns, detail sections, status mapping, and any page-specific mapper. The controller owns fetch lifecycle, local view state, filtering, paging, selected row, refresh, rendering, and mutation refresh. Page modules supply data interpretation and view descriptors, not duplicate fetch/navigation/modal code.

The shared visual layer builds a workspace header, KPI cards, filter chips, register table, row actions, pager, selected-record detail, fact cards, linked lists, and states using `AquaFleetUi.element` and the existing formatters. Each workspace can opt out of an element when the frozen design does not contain it; do not force every design into a rigid template. Specific detail blocks may provide a page-owned render callback. Keep the existing `renderVessels` code intact for the pilot. Only extract a proven vessel helper later if a new page needs the same behavior and a before/after browser comparison passes.

The integration seam in `app.js` is narrow: `navigate()` keeps the current route keys, shell, search reset, active nav, and mobile behavior; it delegates eligible keys to `AquaFleetWorkspace.open(key)`. Dashboard, Vessels, Reports, and any unconverted resource keep their existing paths until each batch is accepted. `mutationComplete()` and `refreshIfCurrent()` dispatch to the active workspace after `Master` finishes; no second CRUD implementation is introduced. `AquaFleetApp` remains the global interface used by `auth.js` and `master-data.js`.

## 4. Exact proposed file/folder structure

```text
frontend/
  index.html                         # add deferred workspace scripts/CSS in dependency order
  js/
    api.js                           # existing, unchanged contract
    ui.js                            # existing shared primitives; small additive changes only
    resources.js                     # existing API resource metadata
    permissions.js                   # existing display policy
    master-data.js                   # existing CRUD/form owner
    workspaces/
      data.js                        # pure indexing, grouping, availability and KPI helpers
      components.js                  # shared DOM builders and state compositions
      controller.js                  # workspace registry, fetch, local state, selection, pager
      pages/
        master.js                    # zones, assets, operators, vehicles, sensors, packs
        equipment.js                 # vehicle sensors, vehicle batteries, maintenance
        operations.js                # expeditions, missions, mission vehicles/operators
        science.js                   # samples, aliquots, incidents
        field.js                     # telemetry points, inspection tasks
    reporting.js                     # existing reports; receives visual integration
    report-csv.js                    # returned-row CSV serialization/download only
    auth.js                          # existing; no authentication redesign
    landing.js                       # existing public view
    app.js                           # route/search/dashboard/vessels coordinator
  css/
    style.css                        # existing shell, Dashboard, vessel, legacy CSS
    workspaces/
      components.css                 # scoped shared workspace layout/components/states
      responsive.css                 # workspace breakpoints and overflow behavior
      pages.css                      # only genuine page-specific exceptions, scoped by route
    landing.css                      # existing, untouched
  tests/
    workspace-data.test.js           # pure mapping/availability/status semantics
    workspace-controller.test.js     # state/search/pager/stale response/CRUD dispatch
    report-csv.test.js               # CSV scope and escaping
    phase1.test.js                   # existing regression
    phase2.test.js                   # existing regression
    dashboard.test.js                # existing regression
```

These are **proposed future files**, not files created in this planning task. `index.html` should load `data.js`, `components.js`, `controller.js`, then page descriptors after `master-data.js` and before `app.js`; `report-csv.js` should load before `reporting.js`. Keep `auth.js` before `landing.js` and `app.js` as today. CSS for workspaces should load after `style.css`, with all new selectors rooted at `.workspace-view` or a page-specific child class. Create a file only in the batch that first uses it; `pages.css` can be omitted if no exception proves necessary.

## 5. Existing functions to reuse

| Existing owner | Reuse |
| --- | --- |
| `AquaFleetApi.get/post/put/del` | All current resource/report routes, credentials and 401 behavior. |
| `AquaFleetUi.element`, `clearElement`, `setPageHeader`, `formatDate`, `formatDateTime`, `formatNumber`, `nullableText`, `statusBadge` | Safe DOM, formatting and presentation. |
| `AquaFleetUi.renderLoading/renderEmpty/renderError`, `showAlert`, `openModal/closeModal`, `setButtonPending` | Basic states, feedback and modal lifecycle. |
| `AquaFleetResources.byKey` | Route keys, primary paths, existing field descriptors. |
| `AquaFleetPermissions.can` and `AquaFleetMasterData.can` | Visibility of permitted actions; backend still enforces authorization. |
| `AquaFleetMasterData.openCreate/openEdit/openDelete`, `recordPath` | Every create/edit/delete, including composite keys and relation options. |
| `AquaFleetReports.render` | Five report definitions, filters, JSON query and read-only semantics. |
| `AquaFleetApp.navigate`, `clearSearch`, health/session boot | Existing route and authentication compatibility. |

## 6. Functions that may eventually be extracted

First generalize the patterns, not the vessel implementation: `filterRows`, `searchableValues`, `normalizeText`, `renderNoMatches`, `makeRefreshButton`, and the useful pieces of `renderTable`/`showDetails` may move to `workspaces/data.js`, `components.js`, or `controller.js` when the first new page uses them. Rewire the legacy resource path only after tests show unchanged behavior. Research Vessels' `visibleVessels`, `selectVessel`, `buildVesselRegister`, `buildVesselDetail`, `buildVesselKpis`, `renderVesselWorkspace`, and `renderVessels` are reference implementations, not initial extraction targets. Later share its row-selection, pager, pill, or fact-card functions only if identical semantics are confirmed in another page. Dashboard's `dashboardMetric`, panel builders and `renderDashboard` stay Dashboard-owned; Reports stays in `reporting.js`.

## 7. Routed page to module mapping

| Page | Owner after migration | Existing read APIs | Key page-specific interpretation |
| --- | --- | --- | --- |
| 01 Dashboard | `app.js` existing | Existing Dashboard resource/health calls | Preserve current composition and literal metric wording. |
| 02 Research Vessels | `app.js` existing | `/api/vessels`, `/api/expeditions` | Preserve deployment/register behavior. |
| 03 Marine Zones | `pages/master.js` | `/api/marine-zones`, `/api/missions` | Mission count by `zone_id`. |
| 04 Offshore Assets | `pages/master.js` | `/api/offshore-assets`, `/api/inspection-tasks` | Task counts by `asset_id`; zero tasks = **Not inspected**. |
| 05 Operators | `pages/master.js` | `/api/operators`, `/api/mission-operators`, `/api/missions` | Assignment links/status from parent mission; no free-text certification inference. |
| 06 Vehicles | `pages/master.js` | `/api/vehicles`, `/api/vehicle-sensors`, `/api/mission-vehicles`, `/api/vehicle-batteries` | Equipment/assignment joins by `vehicle_id`. |
| 07 Sensors | `pages/master.js` | `/api/sensors`, `/api/vehicle-sensors` | Actual `calibration_date`; absent = **Not recorded**; no Due Soon. |
| 08 Battery Packs | `pages/master.js` | `/api/battery-packs`, `/api/vehicle-batteries` | Capacity/assignments and all valid health enums, including Poor. |
| 09 Vehicle Sensors | `pages/equipment.js` | `/api/vehicle-sensors` | Installed row facts; no invented operating status. |
| 10 Vehicle Batteries | `pages/equipment.js` | `/api/vehicle-batteries` | Open assignment iff `end_cycle` null; preserve composite path. |
| 11 Maintenance Records | `pages/equipment.js` | `/api/maintenance-records` | Show `maint_date`, `next_due_date`, vehicle status. Never claim Overdue without evidence that due date passed and relevant work remains incomplete; current schema lacks completion state, so omit lifecycle pill. |
| 12 Missions | `pages/operations.js` | `/api/missions`, `/api/mission-vehicles`, `/api/mission-operators` | Linked counts/lists by `mission_id`; include Aborted. |
| 13 Mission Vehicles | `pages/operations.js` | `/api/mission-vehicles` | `recovery_time` missing = Unrecovered, not live depth. |
| 14 Mission Operators | `pages/operations.js` | `/api/mission-operators`, `/api/missions` | Parent mission status via `mission_id`; label counts literally. |
| 15 Telemetry Points | `pages/field.js` | `/api/telemetry-points` | Display actual battery percent; no Nominal/Warning threshold. |
| 16 Incidents | `pages/science.js` | `/api/incidents` | Stored severity; no open/closed state. |
| 17 Inspection Tasks | `pages/field.js` | `/api/inspection-tasks` | Stored priority/status; open = Pending or In Progress. |
| 18 Expeditions | `pages/operations.js` | `/api/expeditions`, `/api/missions` | Linked missions; include Cancelled; label planned counts precisely. |
| 19 Samples | `pages/science.js` | `/api/samples`, `/api/sample-aliquots` | Aliquot list by `sample_id`; include Disposed. |
| 20 Sample Aliquots | `pages/science.js` | `/api/sample-aliquots` | Parent custody only; include Disposed; no undefined Custody Closed. |
| 21 Reports | `reporting.js` + `report-csv.js` | Five existing `/api/reports/*` JSON GETs | Export only currently returned selected-report rows. |

Page 22 provides shared-state acceptance criteria across these routes; page 23 is a reviewer index. Neither receives a nav route or resource module. All writes continue through the existing resource paths in `resources.js` and `Master`.

## 8. Shared component consumption matrix

Legend: `M` = 03–08, `E` = 09–11, `O` = 12–14 and 18, `S` = 16 and 19–20, `F` = 15 and 17, `R` = 21. Dashboard/Vessels keep their current components unless a later extraction is proved safe.

| Shared component | M | E | O | S | F | R |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Workspace shell/header and responsive panels | Yes | Yes | Yes | Yes | Yes | Reports variant |
| Literal KPI card rendering | Yes | Yes | Yes | Yes | Yes | Returned-row summary |
| Register rows, selected detail, linked lists | Yes | Yes | Yes | Yes | Yes | Report table only |
| Search, enum/status filter chips, no-match state | Yes | Yes | Yes | Yes | Yes | Existing server filters |
| Status pill mapped only from factual fields | Yes | Yes | Yes | Yes | Yes | Existing report badges |
| Eight-row pager and count announcement | Yes | Yes | Yes | Yes | Yes | If artifact needs pagination; never omit exported rows |
| RBAC-aware CRUD actions through `Master` | Yes | Yes | Yes | Yes | Yes | No CRUD |
| Loading, failed-primary, failed-related, empty, restricted | Yes | Yes | Yes | Yes | Yes | Loading/error/empty/restricted |

The actual card, column, pill, filter and detail configuration must match each frozen artifact, adjusted only where API truth or locked decisions require factual labels. Page-specific components may be inserted into shared layout slots; the matrix is a reuse target, not permission to erase differences.

## 9. CSS organization

Keep `style.css` as the existing shell, Dashboard, Vessels and legacy-screen baseline during migration. Add only shared new-workspace selectors to `workspaces/components.css`: panel grid, KPI cards, chips, table rows, detail facts, action alignment, state blocks and focus styles. Put breakpoint behavior and bounded internal scroll in `workspaces/responsive.css`; do not hide records or trap keyboard access to satisfy a desktop mock. Put genuinely unique page visuals in `workspaces/pages.css`, always under `.workspace-view[data-page="..."]` or equivalent. Derive colors, spacing and type from `design-system/tokens.md`; retain existing CSS variables and Bootstrap utilities where aligned. Audit duplicate selectors after each batch; migrate old generic rules only when no page consumes them. `landing.css` remains separate.

## 10. State and data-fetch strategy

Per active workspace, hold `{key, primary, relations, loadState, relationStates, query, filters, page, selectedId, requestVersion}`. Primary and each relation use explicit `loading | ready | error` plus rows; `ready` with zero rows is distinct from `error`. Fetch primary and required relations concurrently through `Api.get` using `Promise.allSettled`; fail the workspace on primary failure and mark related metrics/sections **Unavailable** on a relation failure. Never convert a failed relation to a factual zero. One request version per open/refresh/mutation prevents stale responses from painting after route changes or newer requests.

Cache successful arrays for the active view. Search, filters, row selection and pagination transform cached rows locally; no network call on keystrokes. Explicit Refresh and successful `Master` mutations refetch the primary and affected relations. Clear cached account data on logout/session loss by following `AquaFleetApp.clearSearch` and the existing auth lifecycle. After reload, retain query/filter; keep selected ID if still present, otherwise select the first visible row; clamp page to its new count. Indexed joins keyed by actual IDs produce KPIs, links and detail data; never embed artifact sample rows. A route may request only the related collections its current composition needs.

## 11. CRUD integration strategy

Descriptors point to the existing resource key; buttons invoke `Master.openCreate(key)`, `openEdit(key,row)`, and `openDelete(key,row)`. `master-data.js` remains sole owner of form schema, relation options, local validation, HTTP mutation, delete confirmation and composite paths. `AquaFleetApp.mutationComplete` reloads the active new workspace and shows the existing success alert; `refreshIfCurrent` handles stale/deleted rows. Keep backend constraint and 403/validation messages visible in the modal. Do not duplicate forms, invent fields or turn Reports into writable data.

## 12. Search and filter strategy

Keep the existing single global search input, its 140 ms debounce, Escape/clear behavior, and route-change reset. The workspace controller receives the query through `app.js` and searches descriptor-declared scalar and joined display fields with the existing normalization approach. Filter chips use complete real enum sets (Poor, Aborted, Cancelled and Disposed included), plus only defensible derived groups. Search and chips compose with AND; KPI totals remain based on full successfully loaded data unless the artifact explicitly labels a visible subset. Filter changes reset to page 1 and reconcile selection. Empty source, no search matches, and no filter matches have distinct copy and clear actions. Reports retain their existing server-side filter controls and do not inherit resource search unless the artifact calls for a local returned-row search.

## 13. RBAC strategy

All authenticated roles may read the existing routes. Show/hide action controls via `AquaFleetMasterData.can`/`AquaFleetPermissions.can`; do not alter `permissions.js` policy or rely on hidden buttons as security. The Flask authorization remains final. Admin alone writes vessels, zones, assets, operators, vehicles, sensors and battery packs. Admin/Researcher create and update expeditions and samples/aliquots; Admin alone deletes them. Missions are created by Admin/Researcher, updated by Admin/Researcher/Operator and deleted by Admin. Mission assignments allow Admin/Researcher/Operator writes. Vehicle equipment assignments, maintenance, telemetry, incidents and inspection tasks allow Admin/Operator writes. Reports are read-only. Restricted states appear only for actual 403/authorization outcomes; a viewer with read access sees the page without write actions.

## 14. Loading, error, empty and restricted states

Use `Ui.renderLoading`, `renderEmpty`, `renderError` and alerts as behavioral bases, styled to the Interface States artifact. Render page skeleton/loading during the primary fetch; show a retryable error on primary failure. If only a relation fails, keep primary rows visible and render **Unavailable** for affected KPI, linked list or status, with retry; do not claim zero or Not inspected from an error. Use neutral **Not recorded** for absent calibration data, **Not inspected** only for a successfully fetched empty asset task set, and `—`/clear copy for other missing fields. Separate empty database, no matches, and successful zero relations. Keep accessible focus, `aria-live` count/status updates, and clear pending/disabled states. A 401 follows the existing session path; 403 is shown as restricted with no unauthorized action retry loop.

## 15. Client-side CSV strategy

Keep `reporting.js` as the owner of active report key, server filter, returned rows and column order. Add `report-csv.js` as a pure serializer plus a small browser download adapter. Enable Export CSV only after a successful selected-report response, and download **exactly those returned rows**, using that report's visible column definitions and stable field order. Do not refetch or imply a full database export. Escape quotes, commas and newlines per CSV rules; prevent spreadsheet formula interpretation for cells beginning with `=`, `+`, `-`, `@`, tab or carriage return; preserve null as empty and ordinary numbers/dates as returned displayable values. Use a report/filter-aware filename, a Blob URL, and revoke it after download. No backend CSV route or API contract change.

## 16. Responsive verification strategy

Compare each implementation against its frozen artifact at desktop width, then inspect approximately 1440, 1024, 768, 390 and 320 px widths and browser zoom at 200%. Check rectangular nav/sidebar behavior, header and KPI wrapping, table horizontal scrolling, detail stacking, chip overflow, buttons, modal fit, keyboard focus, and selected-row visibility. Desktop internal scroll may preserve the intended composition, but all rows/details must remain reachable at smaller widths. Test a long real label, no data, many rows, and error state so sample artifact lengths do not mask overflow. Research Vessels and Dashboard get a visual smoke check every batch.

## 17. Test strategy

Run the existing frontend tests after every batch, plus focused tests for pure ID joins/KPI denominators, unavailable-versus-empty distinction, full enum filters, literal labels and locked decisions. Test controller behavior for query/filter/pager/selection, stale request guard, relation failure and post-mutation refresh. Test action visibility for representative Admin, Researcher, Operator and read-only roles; also verify backend 403 is surfaced. Test composite-key paths through existing `Master` behavior rather than reimplementing mutations. CSV tests cover selected report/returned rows, filter scope, header order, escaping, null and formula-like values. Browser checks cover real API response shape, all CRUD affordances (with safe test data where appropriate), navigation, refresh, keyboard and mobile layout. No tests should assert artifact sample counts or unsupported statuses.

## 18. Incremental implementation batches

Every checkpoint below is a **future proposed Git checkpoint**, not a commit in this planning task. Finish and review a batch before starting the next; commit only the accepted batch with its tests and visual evidence. `frontend/index.html`, `frontend/js/app.js`, workspace CSS/JS, and tests change incrementally, not all at once. Files listed are expected touch points, not permission to edit backend, schema, auth, policy, API contracts or frozen artifacts.

### Batch 1 — Shared foundation and Marine Zones (03)

- **Pages:** Marine Zones pilot; Dashboard and Research Vessels regression only.
- **Files:** `frontend/index.html`, `frontend/js/app.js`, new `workspaces/data.js`, `components.js`, `controller.js`, `pages/master.js`, new `css/workspaces/components.css` and `responsive.css`, `tests/workspace-data.test.js`, `tests/workspace-controller.test.js`.
- **APIs:** `GET /api/marine-zones`, `GET /api/missions`; existing zone writes through `Master`.
- **Components:** shell, literal KPI, filter, register/detail, linked mission list, pager, CRUD actions, shared states.
- **Tests:** zone ID joins; primary and relation failure; search/filter/selection/pager; Admin versus viewer actions; existing suite.
- **Browser verification:** frozen Zone artifact comparison; zone create/edit/delete with test records if feasible; no-mission and failed-missions states; Dashboard/Vessels desktop/mobile smoke.
- **Git checkpoint:** one reviewed foundation + Zone page commit after tests and screenshots; record any intentional visual/data-copy deviations.

### Batch 2 — Master registers (04–08)

- **Pages:** Offshore Assets, Operators, Vehicles, Sensors, Battery Packs.
- **Files:** `workspaces/pages/master.js`, `workspaces/data.js`, `workspaces/components.js`, `css/workspaces/components.css`, optional `pages.css`, focused workspace tests; `app.js`/`index.html` only if route/script wiring needs adjustment.
- **APIs:** primary GETs for `/api/offshore-assets`, `/api/operators`, `/api/vehicles`, `/api/sensors`, `/api/battery-packs`; related GETs `/api/inspection-tasks`, `/api/mission-operators`, `/api/missions`, `/api/vehicle-sensors`, `/api/mission-vehicles`, `/api/vehicle-batteries`; existing `Master` writes.
- **Components:** shared register/detail/KPIs/chips/pager/pills/actions; ID-indexed relation sections and unavailable state.
- **Tests:** zero asset tasks = Not inspected; failed task fetch = Unavailable; neutral sensor calibration; full battery health enum; vehicle/operator joins; existing suite.
- **Browser verification:** compare each artifact; long operator/asset names; relation failures; Admin and read-only roles; mobile overflow; Dashboard/Vessels smoke.
- **Git checkpoint:** reviewed five-page master-register commit with behavior and visual evidence.

### Batch 3 — Equipment relationships (09–11)

- **Pages:** Vehicle Sensors, Vehicle Batteries, Maintenance Records.
- **Files:** new `workspaces/pages/equipment.js`, `frontend/index.html` script registration, `workspaces/data.js` and `components.js` if reused needs emerge, scoped CSS, focused tests.
- **APIs:** `GET /api/vehicle-sensors`, `/api/vehicle-batteries`, `/api/maintenance-records`; writes through existing `Master` composite paths and forms.
- **Components:** register/detail, factual status pill, KPI, filters, pager, modal CRUD and states.
- **Tests:** composite key record identity/path; open assignment based on null `end_cycle`; maintenance shows dates without fabricated lifecycle; Admin/Operator actions; existing suite.
- **Browser verification:** all three artifacts, edit/delete link behavior, past due date with no proven completion, dense table at narrow widths, Vessels smoke.
- **Git checkpoint:** reviewed equipment-page commit after API and responsive verification.

### Batch 4 — Expedition and mission operations (12–14, 18)

- **Pages:** Expeditions, Missions, Mission Vehicles, Mission Operators.
- **Files:** new `workspaces/pages/operations.js`, `frontend/index.html`, `workspaces/data.js`, `components.js`, scoped CSS and tests.
- **APIs:** `GET /api/expeditions`, `/api/missions`, `/api/mission-vehicles`, `/api/mission-operators`; writes through existing `Master`.
- **Components:** relation-backed KPIs, register/detail, linked assignment lists, full enum chips, factual pills, pager and RBAC actions.
- **Tests:** ID joins/counts; Aborted/Cancelled states; Unrecovered wording; parent-status join for operators; role-specific create/update/delete; existing suite.
- **Browser verification:** four frozen artifacts, empty assignments, long mission titles, failed relation, modal workflows, 320–1440 px layout, baseline pages.
- **Git checkpoint:** reviewed operations commit with explicit KPI definitions.

### Batch 5 — Samples and incident data (16, 19–20)

- **Pages:** Incidents, Samples, Sample Aliquots.
- **Files:** new `workspaces/pages/science.js`, `frontend/index.html`, shared components/data as needed, scoped CSS and tests.
- **APIs:** `GET /api/incidents`, `/api/samples`, `/api/sample-aliquots`; existing `Master` writes.
- **Components:** register/detail, lineage/aliquot linked list, enum filters/pills, KPI, pager, CRUD and states.
- **Tests:** sample-to-aliquot join and distinct count wording; Disposed enum; parent custody without inferred aliquot state; incident severity/no open-closed inference; RBAC; existing suite.
- **Browser verification:** three artifacts, long descriptions, no aliquots and failed relation, create/edit/delete modal flow, mobile/zoom and baseline pages.
- **Git checkpoint:** reviewed science/incident commit with lineage checks.

### Batch 6 — Field observations and inspections (15, 17)

- **Pages:** Telemetry Points and Inspection Tasks; cross-check Offshore Asset links/status from Batch 2.
- **Files:** new `workspaces/pages/field.js`, `frontend/index.html`, shared data/components and scoped CSS if needed, focused tests.
- **APIs:** `GET /api/telemetry-points`, `/api/inspection-tasks`, existing `Master` writes; `/api/offshore-assets` for cross-page navigation verification only.
- **Components:** factual KPI, register/detail, stored status/priority pills, filters, pager, CRUD and states.
- **Tests:** telemetry percentage without threshold; inspection open status Pending/In Progress; task-to-asset link; missing/failed data distinction; Admin/Operator roles; existing suite.
- **Browser verification:** both artifacts, extreme telemetry values, all inspection states, cross-page asset consistency, narrow viewport and baseline pages.
- **Git checkpoint:** reviewed field-page commit with locked product copy.

### Batch 7 — Reports and cross-page consistency (21; reference 22–23)

- **Pages:** Reports; apply Interface States (22) consistently to routed pages. Design Index (23) remains documentation only.
- **Files:** `frontend/js/reporting.js`, new `frontend/js/report-csv.js`, `frontend/index.html`, `css/workspaces/components.css`/`responsive.css` and optional `pages.css`, `tests/report-csv.test.js`, focused workspace tests; touch `ui.js` only for a truly shared additive state primitive.
- **APIs:** the five existing `/api/reports/expeditions`, `/missions`, `/vehicle-readiness`, `/sample-lineage`, `/incidents` JSON GETs; no write or CSV endpoint.
- **Components:** report tabs/toolbar/table, shared loading/error/empty/restricted styling, returned-row Export CSV, consistent toast/modal/state presentation.
- **Tests:** report selection/filter, response race, CSV of selected returned rows with escaping/formula defense, empty/error export disablement; complete existing and workspace suites.
- **Browser verification:** Reports artifact and all five report types; downloaded CSV matches visible returned dataset; final 21-route desktop/mobile/keyboard pass, Interface States comparison, Dashboard/Vessels regression.
- **Git checkpoint:** reviewed reports/final-consistency commit only after all routed pages and cross-role smoke checks pass.

**Allocation:** seven batches deliver the 19 remaining routed pages exactly once: 1 + 5 + 3 + 4 + 3 + 2 + 1. Dashboard and Research Vessels are regression baselines, not reimplementation tasks. Highest risk: asset/zone and other relation-derived metrics under partial failures; maintenance/sensor/telemetry wording; composite-key CRUD; operation/science multi-collection joins; Reports CSV scope; responsive density and existing Vessels visual stability.
