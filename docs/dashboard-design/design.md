# AquaFleet Authenticated Dashboard — Final Design Specification

## 1. Purpose

This document defines the final approved visual design for the authenticated AquaFleet Dashboard.

This specification is authoritative for implementation.

The dashboard redesign must preserve the existing AquaFleet application logic, data sources, APIs, authentication, RBAC, search behavior, navigation behavior, mission-detail functionality, health handling, and existing functional contracts.

This redesign changes presentation only.

---

## 2. Authoritative Visual References

The implementation must use the following files as visual references:

```text
docs/dashboard-design/references/
├── 01-dashboard-style-reference.png
├── 02-current-dashboard-before-redesign.png
└── 03-final-approved-dashboard.png
```

### Primary implementation target

```text
03-final-approved-dashboard.png
```

This is the **FINAL APPROVED AquaFleet Dashboard design**.

The real implementation must match this screenshot as closely as practical.

### Structural/style reference

```text
01-dashboard-style-reference.png
```

This image defines the original visual direction that inspired the Dashboard:

- dark rounded navigation sidebar;
- bright blue/cyan header;
- light-grey application workspace;
- rounded white content cards;
- soft dashboard geometry;
- clean spacing;
- friendly dashboard proportions;
- lively but controlled visual hierarchy.

### Historical implementation reference

```text
02-current-dashboard-before-redesign.png
```

This image represents the real AquaFleet Dashboard before this visual redesign.

It is **not** the visual target.

Its existing functionality must, however, remain intact where applicable.

---

## 3. Reference Priority

When references differ, use the following priority:

```text
03-final-approved-dashboard.png
        ↓
design.md
        ↓
01-dashboard-style-reference.png
        ↓
02-current-dashboard-before-redesign.png
        ↓
old implementation styling
```

The final approved AquaFleet screenshot always wins over the original inspiration image.

---

## 4. Design Intent

The authenticated AquaFleet experience should feel like:

> A polished, bright marine research fleet operations workspace that continues the AquaFleet identity established by the landing experience.

The landing page is cinematic, atmospheric, dark, and immersive.

After authentication, the user transitions into a brighter environment optimized for operational work.

The Dashboard should feel:

- professional;
- polished;
- lively;
- operational;
- data-driven;
- easy to scan;
- bright;
- modern;
- marine-specific;
- visually active without becoming distracting.

The Dashboard must **not** feel like:

- a dark command centre;
- a cyberpunk interface;
- a generic AI-generated dashboard;
- a card wall;
- a plain Bootstrap admin page;
- a sterile enterprise screen;
- an overly minimal static workspace;
- a detached dashboard mockup floating inside the browser.

---

## 5. Full-Page Application Requirement

The Dashboard must operate as a real full-screen web application.

Desktop target:

```css
width: 100vw;
min-height: 100vh;
```

The design must not appear as a small centered dashboard surrounded by large unused margins.

At:

- 1920×1080
- 1440×900
- 1366×768
- 1280×720

the application should consume the available viewport naturally.

The browser viewport itself is the AquaFleet application canvas.

---

## 6. Overall Visual Architecture

The Dashboard consists of four major visual layers:

```text
Outer pale application background
            ↓
Dark marine navigation sidebar
            ↓
Light-grey main dashboard workspace
            ↓
White operational cards and panels
```

These elements must feel like one coherent AquaFleet application.

The authenticated interface should transition visually from:

```text
Dark cinematic landing
        ↓
Authentication
        ↓
Bright AquaFleet operations workspace
```

Both experiences must clearly belong to the same product.

---

## 7. Color Direction

The authenticated application is predominantly light.

Approximate visual balance:

```text
75–80%   white / off-white
10–15%   marine navy / blue
5–10%    cyan / pale marine accents
```

### Outer application background

Recommended direction:

```text
#F3F7F9
#EEF4F6
```

### Main dashboard workspace

Recommended direction:

```text
#EAF0F3
#EDF3F5
#E7EEF2
```

### Card surfaces

```text
#FFFFFF
```

### Deep marine navy

```text
#082633
#0A2B38
#102F3D
```

### Header marine blue

Gradient direction:

```text
#2F6797
#4797C1
#6AC5DB
```

### AquaFleet cyan

```text
#63C7D4
#78D1DB
```

### Pale marine blue

```text
#EAF5F8
#EFF8FA
```

### Primary text

```text
#15313D
```

### Secondary text

```text
#6B818B
```

### Borders / separators

```text
#DDE8EC
```

Exact values may be tuned slightly during implementation, but the approved visual balance must remain intact.

---

## 8. Sidebar

The authenticated navigation sidebar remains dark marine navy.

It provides the strongest visual continuity with the landing page.

### Characteristics

The sidebar should:

- occupy the full viewport height;
- remain anchored to the far left;
- feel visually substantial;
- use a large smooth rounded silhouette;
- maintain generous vertical spacing;
- contain centered navigation icons;
- contrast strongly against the pale Dashboard workspace;
- avoid the appearance of a generic thin navigation rail.

The exact final geometry should match:

```text
03-final-approved-dashboard.png
```

### Desktop width

Approximate range:

```text
88px–110px
```

The approved screenshot determines the final target.

---

## 9. Sidebar Geometry

The sidebar should feel like a tall, smooth marine navigation slab.

Important characteristics:

- dark navy surface;
- smooth outer curvature;
- large rounded corners where visible;
- clean edge against the Dashboard workspace;
- vertically balanced icon arrangement;
- minimal unnecessary visual decoration.

Avoid:

- excessive width;
- sharp corners;
- floating sidebars;
- disconnected navigation containers;
- multiple unrelated sidebar surfaces.

---

## 10. Active Navigation Item

The selected navigation item must remain visually distinct.

Use:

- white or very pale blue surface;
- marine blue/cyan icon;
- rounded rectangular or pill-like treatment;
- clear contrast against the dark sidebar;
- generous internal spacing.

The active element must feel integrated into the navigation system rather than appearing as an unrelated floating card.

Do not use coral or pink.

The exact active-state geometry must follow the final approved screenshot.

---

## 11. Main Dashboard Workspace

The Dashboard content sits within one continuous pale-grey / blue-grey workspace.

The workspace should:

- fill the remaining viewport beside the sidebar;
- feel continuous rather than fragmented;
- contain the header and all Dashboard content;
- provide strong contrast against the white cards;
- use controlled internal gutters;
- maintain visual breathing room without wasting screen space.

The workspace is the primary authenticated application canvas.

---

## 12. Dashboard Header

The Dashboard header uses the strongest blue area in the authenticated experience.

It must visually match the final approved Claude Design.

### Header content

Left:

```text
AQUAFLEET COMMAND
Dashboard
Fleet, mission and expedition readiness from the current AquaFleet database state.
```

Right:

```text
Search missions
Last refreshed
Refresh Dashboard
```

### Header characteristics

The header should:

- use a blue → cyan marine gradient;
- stretch across the top of the main Dashboard workspace;
- use rounded geometry;
- contain strong white primary text;
- contain restrained decorative blue geometry;
- integrate search and refresh controls;
- remain compact enough for 1366×768;
- feel lively without becoming ornamental.

---

## 13. Header Decorative Geometry

The header may use subtle visual elements such as:

- translucent circles;
- sonar-like arcs;
- overlapping gradient shapes;
- marine geometric overlays.

Opacity must remain low.

These elements exist only to create AquaFleet identity.

They must not interfere with:

- search;
- refresh;
- timestamps;
- headings;
- readability.

No heavy HUD effect should be introduced.

---

## 14. Search Control

The mission search field must remain functionally unchanged.

Visually, it should feel integrated into the blue header.

Use:

- white rounded surface;
- soft rounded rectangular shape;
- search icon;
- generous horizontal padding;
- subtle depth;
- polished focus state;
- marine cyan/blue focus treatment.

It should not look like a default browser input.

---

## 15. Refresh Control

The existing Dashboard refresh behavior must remain intact.

The control may include:

- refresh icon;
- white/transparent-blue styling;
- rounded outline or soft button surface;
- restrained hover transition;
- brief rotation while actively refreshing.

Do not use continuous rotation.

---

## 16. Last Refreshed Metadata

The existing last-refresh time remains visible.

Use IBM Plex Mono or similar technical styling.

It should remain subordinate to primary controls.

Example visual structure:

```text
LAST REFRESHED
09:50:57 AM
```

Avoid excessive font size.

---

## 17. Typography System

Three approved font families are used.

### Sora

Use for:

- Dashboard title;
- primary KPI values;
- major numeric emphasis where appropriate.

Suggested:

```text
Dashboard title:
Sora 700
30–36px

KPI values:
Sora 700
34–42px
```

### Manrope

Use for:

- card headings;
- section titles;
- mission names;
- vessel names;
- expedition names;
- interface controls;
- buttons;
- body copy;
- supporting labels;
- status text.

Suggested:

```text
Section heading:
Manrope 700
18–22px

Body/interface:
Manrope 400–600
12–15px
```

### IBM Plex Mono

Use only for genuinely technical information:

- timestamps;
- small record counts;
- refresh time;
- technical metadata;
- compact IDs where appropriate.

Suggested:

```text
10–12px
```

Do not overuse IBM Plex Mono.

The Dashboard should feel friendly and professional rather than excessively technical.

---

## 18. Card / Panel Language

Cards remain an important part of the approved AquaFleet design.

They must remain clearly visible.

### Characteristics

Cards should use:

- white surfaces;
- soft rounded corners;
- subtle blue-grey borders;
- restrained soft shadows;
- comfortable internal padding;
- consistent but not mechanically identical geometry;
- strong contrast against the pale main workspace.

Recommended radius:

```text
16px–22px
```

Avoid:

- sharp rectangular cards;
- excessive elevation;
- heavy shadows;
- dark card backgrounds;
- excessively large radii;
- identical styling for every component.

---

## 19. Card Motion

Dashboard cards may enter using restrained motion.

Recommended:

```text
opacity: 0 → 1
translateY: 6–12px → 0
duration: 300–450ms
```

Cards may stagger slightly.

Avoid cinematic or dramatic entrance sequences.

The authenticated workspace must remain immediate.

---

## 20. KPI Row

The upper Dashboard area contains four factual metrics:

1. Research Vessels
2. Active Expeditions
3. Active Missions
4. Available Vehicles

Each KPI appears inside a compact white card.

---

## 21. KPI Card Design

Each KPI card should contain:

- small icon badge;
- label;
- prominent numeric value;
- factual supporting text;
- subtle blue/cyan accent;
- small progress/ratio treatment where mathematically meaningful.

The cards must feel visually active but not overloaded.

No fake historical trends.

No fake sparklines.

No fabricated telemetry.

---

## 22. KPI Definitions

### Research Vessels

Value:

```text
Total number of vessel records
```

Supporting text:

```text
Registered fleet platforms
```

### Active Expeditions

Value:

```text
count(expedition.status = Active)
```

Supporting text may include:

```text
1 of 2 programmes active
```

when derivable from actual data.

### Active Missions

Value:

```text
count(mission.status = In Progress)
```

Supporting text may include:

```text
1 of 7 missions in progress
```

when supported by the current response.

### Available Vehicles

Value:

```text
count(vehicle.status = Available)
```

Supporting text:

```text
of N vehicles
```

---

## 23. KPI Motion

On initial Dashboard render:

- numeric values may count up;
- progress accents may animate into width;
- cards may stagger by approximately 50–80ms.

Under reduced motion, values should appear immediately.

---

## 24. Active Operations

Active Operations is the primary Dashboard panel.

It should receive the strongest hierarchy in the main workspace.

The existing mission functionality must remain intact.

---

## 25. Active Operations Data

Each mission row may display:

- mission number/index;
- mission title;
- expedition;
- marine zone;
- start time;
- mission status;
- View action.

Existing client-side Dashboard mission search continues to filter this panel.

Existing mission detail behavior remains unchanged.

---

## 26. Active Operations Styling

Use:

- large white rounded panel;
- strong section heading;
- clean row alignment;
- subtle row separators;
- strong mission-title typography;
- softer expedition metadata;
- restrained status badges;
- clear View action.

Rows must remain compact enough for 1366×768.

---

## 27. In Progress Mission Styling

Mission rows with:

```text
status = In Progress
```

may receive:

- pale cyan row background;
- thin cyan left accent;
- stronger status indicator;
- very subtle status dot pulse.

The effect must remain restrained.

Completed rows should remain mostly neutral.

---

## 28. Mission Row Hover

Hover may use:

- very light blue/cyan tint;
- subtle background transition;
- slight content emphasis.

Avoid:

- large movement;
- heavy shadows;
- obvious scaling.

---

## 29. Fleet Availability

Fleet Availability is the primary supporting analytics panel.

Use existing vehicle records only.

The panel should contain:

- availability percentage;
- donut/radial indicator;
- horizontal segmented status bar;
- status counts;
- compact vehicle roster;
- vehicle type/model;
- vehicle status badges.

---

## 30. Vehicle Availability Calculation

Availability percentage:

```text
Available vehicles / Total vehicles × 100
```

Do not imply real-time telemetry.

Avoid terminology such as:

```text
LIVE
```

unless AquaFleet later supports actual streaming state.

---

## 31. Fleet Availability Donut

Use the real vehicle distribution.

Approved statuses:

- Available
- Deployed
- Maintenance
- Retired

The donut may animate on first render.

Its primary center label may display:

```text
20%
available
```

or the mathematically correct value from current data.

---

## 32. Fleet Segmented Bar

Use a compact horizontal segmented bar showing:

- Available
- Deployed
- Maintenance
- Retired

Segments should use restrained semantic colors.

Recommended direction:

```text
Available      teal / green
Deployed       marine blue
Maintenance    warm amber
Retired        blue-grey
```

---

## 33. Vehicle Roster

The panel may show a bounded vehicle subset.

Each vehicle entry may include:

- vehicle name;
- type;
- model;
- status.

If only a subset appears, communicate it clearly:

```text
3 of 5 shown
```

or:

```text
3 of 5 vehicles shown
```

Do not imply that unshown vehicles do not exist.

---

## 34. Vehicle Status Badges

Status badge direction:

```text
Available      soft green / teal
Deployed       marine blue
Maintenance    warm amber
Retired        neutral blue-grey
```

Badges should:

- remain soft;
- use subtle borders;
- avoid overly saturated colors;
- use Manrope rather than technical mono styling.

---

## 35. Expedition Programme

The Expedition Programme represents current and planned expeditions.

The visual treatment should feel like a compact operational schedule.

---

## 36. Expedition Data

Use real expedition data only.

Each expedition may include:

- title;
- vessel;
- start date;
- end date;
- mission count;
- status.

No fabricated schedule information.

---

## 37. Expedition Timeline

Use a lightweight timeline treatment.

Example:

```text
○──────────────○
20/07/2026     30/08/2026
```

The timeline may include:

- start marker;
- end marker;
- thin line;
- date labels.

Do not render date ranges as disabled form inputs.

---

## 38. Expedition Timeline Motion

The line may draw into place when the Dashboard first appears.

Recommended:

```text
duration: 300–500ms
```

Markers may fade in shortly afterward.

Disable this animation under reduced motion.

---

## 39. Operational Attention

Operational Attention summarizes factual conditions that may require review.

Approved categories:

- High / Critical incidents
- Pending / active inspections
- Vehicles in maintenance
- Battery condition review

Do not invent alerts.

Do not call this:

```text
Live Alerts
```

unless genuine live alerting is introduced later.

---

## 40. Operational Attention Row Design

Each row may include:

- semantic icon;
- title;
- short factual subtitle;
- right-aligned count;
- subtle separator;
- light hover state.

Example:

```text
[!] High / critical incidents                 2
    Recorded incident severity
```

---

## 41. Operational Attention Semantic Colors

Suggested direction:

```text
Incident        muted coral / red
Inspection      amber
Maintenance     pale marine blue
Battery         warm gold / neutral
```

Colors should remain soft and restrained.

---

## 42. Dashboard System Summary

A compact system-summary area may appear inside or below Operational Attention.

Approved factual values include:

- Database status
- Recorded Incidents
- Scientific Samples

Example:

```text
● Database connected    aquafleet_db
Recorded Incidents      6
Scientific Samples      8
```

---

## 43. Database Health Accuracy

The database label must reflect the actual health response.

Never show:

```text
Database connected
```

when the health endpoint reports degraded, failed, or unavailable state.

Possible states may include:

```text
Database connected
Database degraded
Database unavailable
```

according to the existing response.

---

## 44. Incident Terminology

The current incident records do not provide an open/closed lifecycle status.

Therefore:

Do NOT use:

```text
Open Incidents
```

Use:

```text
Recorded Incidents
```

or another factual term directly supported by the data.

---

## 45. Partial API Failures

Failed endpoints must not be silently represented as legitimate zero values.

Incorrect example:

```text
Active Missions
0
```

when the missions API failed.

Correct approach:

```text
Active Missions
Unavailable
```

or equivalent compact unavailable treatment.

Zero is valid only when a successful endpoint response actually contains zero qualifying records.

---

## 46. Data Accuracy Rules

The Dashboard may use only real current AquaFleet API data.

Do NOT fabricate:

- vessel availability;
- live vessel coordinates;
- ocean conditions;
- live telemetry;
- sensor metrics;
- trends;
- historical changes;
- mission performance statistics;
- weather;
- fake alerts;
- fake geographic information;
- fake operational KPIs.

---

## 47. Search Functionality

The existing mission-search behavior must remain unchanged.

Requirements:

- client-side filtering;
- no refetch while typing;
- existing debounce behavior;
- clear button preserved;
- Escape behavior preserved;
- mission-related Dashboard rows filtered as currently supported.

Search should visually match the approved header.

---

## 48. Refresh Functionality

The existing refresh behavior remains authoritative.

The refresh action must:

- reload the Dashboard data;
- preserve stale-response protection;
- preserve loading-state behavior;
- update the last refreshed timestamp.

Presentation may change.

Logic must not.

---

## 49. Dashboard Motion Philosophy

Motion should make the Dashboard feel alive without slowing the user.

The authenticated interface should feel:

- immediate;
- responsive;
- polished;
- operational.

Not cinematic.

---

## 50. Allowed Motion

### Section entrance

```text
300–450ms
```

Use:

- opacity;
- small translate.

### KPI stagger

```text
50–80ms
```

### KPI number count-up

Allowed.

### Mission row stagger

```text
40–60ms
```

### Progress / donut animation

Allowed.

### Expedition timeline draw

Allowed.

### Hover transitions

```text
120–180ms
```

### In Progress indicator

A subtle pulse is allowed.

---

## 51. Motion Restrictions

Do NOT use:

- landing-page cinematic choreography;
- parallax;
- large zooms;
- bouncing;
- floating cards;
- constant card movement;
- cursor-follow effects;
- aggressive HUD animation;
- excessive spring effects.

---

## 52. Reduced Motion

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

Under reduced motion:

- disable KPI count-up;
- disable row stagger;
- disable timeline drawing;
- disable pulsing indicators;
- remove unnecessary transform entrances.

All content must remain immediately usable.

---

## 53. Desktop Layout

The primary desktop structure follows:

```text
┌──────────────────────────────────────────────────────────────┐
│                    BLUE DASHBOARD HEADER                     │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ VESSELS      │ EXPEDITIONS  │ MISSIONS     │ VEHICLES        │
├──────────────────────────────────┬───────────────────────────┤
│ ACTIVE OPERATIONS                │ FLEET AVAILABILITY        │
│                                  │                           │
├──────────────────────────────────┼───────────────────────────┤
│ EXPEDITION PROGRAMME             │ OPERATIONAL ATTENTION     │
└──────────────────────────────────┴───────────────────────────┘
```

The dark sidebar remains fixed on the left.

---

## 54. Critical Viewport

Primary design target:

```text
1366 × 768
```

At this viewport:

- Dashboard header remains visible;
- search remains usable;
- refresh remains usable;
- KPI row remains on one usable line when practical;
- primary panels fit cleanly;
- cards do not overlap;
- unnecessary whole-page scrolling is avoided;
- long lists may scroll internally;
- navigation remains fully usable.

---

## 55. Larger Desktop

At:

```text
1440×900
1920×1080
```

allow:

- increased internal breathing room;
- larger card heights where useful;
- additional visible rows;
- more comfortable gutters.

Do not impose an unnecessarily narrow centered maximum width.

The Dashboard should expand naturally across the viewport.

---

## 56. Tablet

At tablet widths:

- KPI cards may wrap;
- primary panels may stack or reduce columns;
- Active Operations remains the highest-priority content;
- Fleet Availability may move below;
- sidebar behavior may adapt appropriately;
- hierarchy must remain intact.

Do not simply shrink desktop components.

---

## 57. Mobile

Mobile prioritizes usability over literal desktop geometry.

Recommended content order:

1. Dashboard header
2. KPI metrics
3. Active Operations
4. Fleet Availability
5. Expedition Programme
6. Operational Attention

Cards stack vertically.

Navigation may collapse appropriately.

---

## 58. Full-Page Behavior

The Dashboard must remain full-page.

Do NOT introduce:

- a centered fixed-width dashboard mockup;
- large unused surrounding margins;
- a dashboard inside another decorative page frame.

The application must feel like production software.

---

## 59. Whole-Page Scrolling

At the critical desktop viewport, avoid routine whole-page scrolling caused only by design spacing.

Use internal panel scrolling for:

- mission lists;
- vehicle rosters;
- Operational Attention rows;

only when necessary.

The page must remain comfortable and uncluttered.

---

## 60. Existing Functionality That Must Remain Untouched

Do not modify:

- authentication;
- Flask session handling;
- RBAC;
- client-side permission behavior;
- backend routes;
- API contracts;
- database schema;
- resource CRUD screens;
- Reports;
- mission details;
- role-dependent Edit behavior;
- navigation hashes/routes;
- logout;
- session expiry;
- landing page.

---

## 61. Existing Dashboard Logic to Preserve

Preserve:

- concurrent Dashboard API loading;
- `Promise.allSettled()` strategy;
- request-sequence stale-response protection;
- health loading;
- refresh;
- search filtering;
- mission detail behavior;
- partial-failure handling;
- role-based Edit behavior.

Presentation may change.

Behavior must not.

---

## 62. Current Dashboard Data Sources

The current Dashboard uses or may derive data from:

```text
GET /api/auth/me
GET /api/health
GET /api/health/database
GET /api/vessels
GET /api/vehicles
GET /api/expeditions
GET /api/missions
GET /api/samples
GET /api/incidents
GET /api/battery-packs
GET /api/inspection-tasks
```

No additional endpoint is required for the approved Dashboard version.

---

## 63. Maintenance Data Scope

The initial approved Dashboard version does **not** require adding a new maintenance-record request.

Vehicles with:

```text
status = Maintenance
```

may be shown in Operational Attention.

Additional maintenance intelligence may be introduced in a later feature phase.

---

## 64. Recent Activity Scope

The approved Dashboard does not currently require a merged Recent Activity feed.

Do not fabricate an audit trail.

If a future Recent Activity panel is implemented, it must derive only from genuine timestamp-bearing operational records.

---

## 65. CSS Scoping

Dashboard-specific styles must not leak into:

- landing/auth page;
- resource pages;
- Reports;
- modals;
- forms;
- tables outside the Dashboard.

Prefer:

```text
.dashboard-*
```

or an equivalent Dashboard root namespace.

Avoid rewriting global Bootstrap primitives unless unavoidable.

---

## 66. Implementation Scope

Expected production files:

```text
frontend/js/app.js
frontend/css/style.css
```

Expected Dashboard-specific tests:

```text
frontend/tests/dashboard.test.js
```

Only modify additional files when absolutely necessary.

No backend or database changes are required.

---

## 67. Testing Requirements

After implementation, run:

```text
git diff --check
```

JavaScript syntax:

```text
node --check frontend/js/app.js
```

Existing frontend regression tests:

```text
node frontend/tests/phase1.test.js
node frontend/tests/phase2.test.js
```

Dashboard tests:

```text
node frontend/tests/dashboard.test.js
```

All must pass before commit.

---

## 68. Functional Browser Verification

Verify manually:

1. Dashboard loads after authentication.
2. Search filters mission rows.
3. Search does not refetch on each keystroke.
4. Clear search works.
5. Escape behavior works.
6. Refresh Dashboard works.
7. Last-refreshed value updates.
8. Mission View opens the existing details modal.
9. Role-dependent Edit behavior remains intact.
10. Partial API failures show unavailable states.
11. Database health reflects the real response.
12. Logout remains unaffected.
13. Landing page remains unaffected.

---

## 69. Visual Browser Verification

Verify at:

```text
1366×768
1440×900
1920×1080
1280×720
```

Also inspect tablet and mobile behavior.

Check:

- sidebar width and geometry;
- active navigation treatment;
- header dimensions;
- search alignment;
- refresh alignment;
- KPI spacing;
- card radius;
- panel alignment;
- internal scrollbars;
- Fleet Availability composition;
- Active Operations density;
- Expedition Programme timeline;
- Operational Attention spacing;
- full-page fit.

---

## 70. Visual Acceptance Reference

The authoritative acceptance image is:

```text
docs/dashboard-design/references/03-final-approved-dashboard.png
```

The implementation must be visually compared against this screenshot.

Particular attention must be paid to:

- full-page composition;
- marine sidebar;
- blue header;
- pale workspace;
- white cards;
- card spacing;
- typography hierarchy;
- Dashboard density;
- KPI proportions;
- panel radii;
- visual balance.

---

## 71. Reference Style Image

The source style image is:

```text
docs/dashboard-design/references/01-dashboard-style-reference.png
```

It defines:

- soft dashboard geometry;
- rounded navigation;
- blue header;
- light canvas;
- white dashboard cards;
- friendly visual proportions.

Do not copy:

- fake graph values;
- fake charts;
- unrelated icons;
- placeholder text;
- unrelated controls.

Only structural and visual principles should transfer.

---

## 72. Historical Dashboard Screenshot

The old Dashboard screenshot is:

```text
docs/dashboard-design/references/02-current-dashboard-before-redesign.png
```

It exists for comparison and functional context.

Do not recreate its:

- coral theme;
- old white card system;
- Operational Pulse rail;
- “Live” terminology;
- “Open Incidents” terminology;
- original dashboard composition.

---

## 73. Implementation Rule

The implementation phase must **not reinterpret the approved design**.

Do not change the visual direction because another implementation would be easier.

If difficulty occurs:

1. preserve existing functionality;
2. preserve the approved appearance;
3. find the least invasive technical implementation;
4. document any unavoidable deviation.

Do not silently redesign the Dashboard.

---

## 74. No Design Drift

Once implementation begins, avoid introducing:

- new dashboard sections;
- different layout grids;
- different color themes;
- additional analytics;
- new fake icons/data;
- unnecessary redesigns;
- alternative Dashboard concepts.

The final Claude Design screenshot is frozen.

Implementation is translation, not another design phase.

---

## 75. Accessibility

The Dashboard should preserve good accessibility practices.

Requirements include:

- sufficient contrast;
- visible keyboard focus;
- semantic buttons;
- readable status labels;
- no color-only state communication where avoidable;
- reduced-motion support;
- readable small text;
- keyboard-accessible mission actions.

---

## 76. Performance

Dashboard visual improvements should not require heavy frontend frameworks or unnecessary libraries.

Prefer:

- CSS;
- existing JavaScript;
- existing DOM rendering;
- lightweight SVG/CSS graphics;
- native animations.

Avoid unnecessary WebGL or large visualization libraries.

---

## 77. Design System Continuity

AquaFleet now has two complementary visual modes.

### Landing / Authentication

Dark, cinematic, atmospheric.

Key characteristics:

- dark ocean;
- photoreal research vessel;
- radar/HUD;
- cinematic entrance;
- marine navy;
- cyan instrumentation.

### Authenticated Dashboard

Bright, operational, practical.

Key characteristics:

- pale workspace;
- dark marine navigation;
- blue/cyan header;
- white cards;
- Sora / Manrope typography;
- restrained technical metadata;
- factual operational information.

The contrast between these modes is intentional.

The product identity remains continuous through:

- marine palette;
- typography;
- AquaFleet branding;
- cyan accents;
- scientific/operational language.

---

## 78. Dashboard Design Freeze

The visual design represented by:

```text
docs/dashboard-design/references/03-final-approved-dashboard.png
```

is frozen.

Do not continue visual exploration during implementation.

The approved design should now be translated into the production AquaFleet frontend.

---

## 79. Final Acceptance Criteria

The Dashboard redesign is complete only when all of the following are true:

- the production Dashboard closely matches `03-final-approved-dashboard.png`;
- the design fills the browser viewport appropriately;
- the sidebar remains usable;
- the header matches the approved structure;
- all four KPIs display real values;
- Active Operations uses real mission data;
- Fleet Availability uses real vehicle data;
- Expedition Programme uses real expedition data;
- Operational Attention uses factual conditions only;
- partial API failures are distinguishable from real zeros;
- database status is accurate;
- search works;
- refresh works;
- mission View works;
- RBAC remains intact;
- landing/auth remains unchanged;
- CRUD pages remain unchanged;
- Reports remain unchanged;
- reduced-motion behavior works;
- frontend tests pass;
- browser QA passes at 1366×768.

---

## 80. Final Product Intent

The final authenticated AquaFleet Dashboard should feel like:

> A polished, bright marine research operations platform with clear operational data, soft modern geometry, strong AquaFleet visual identity, and restrained interactive motion.

The final experience should transition naturally from:

```text
cinematic AquaFleet landing
            ↓
authentication
            ↓
bright professional AquaFleet operations workspace
```

The user should immediately understand that both environments belong to the same AquaFleet platform.

---

## 81. Implementation Philosophy

The Dashboard implementation should follow one final rule:

> Preserve the approved design. Preserve the working application. Change only what is required to make those two things coexist.

This document and the approved screenshot together define the final target.
