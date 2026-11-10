# Dashboard stages 1–6 acceptance — 10 November 2026

## Scope and isolation
All browser writes used a new, clearly labelled Dashboard Acceptance Demo business and fixture project. No existing project was edited. Restricted browser roles used the requesting user's authenticated session with temporary memberships only in that isolated business, not fabricated client-side roles.

## Results
- D1: live RFI totals and overdue counts, outstanding actions and refreshed dashboard reads verified.
- D2: all six chart types rendered; chart result pagination showed 50, then all 60 and all 2,105 records. Clicking the exact first and sixtieth RFI opened the matching record. Photo/report charts were checked in their empty-data state in this fixture; a new photo upload or report issue was not exercised in this run.
- D3: re-baseline required a reason; original and subsequent dated baselines remained visible in history. Milestone dates and calendar-day variance rendered.
- D4: original £100,000 plus £5,000 adjustment produced £105,000 current budget; £110,000 forecast was adverse for cost and favourable for revenue. Pending £4,250 change estimate stayed separate. Resource Manager commercial access was tested both without and with the separate grant.
- D5: project weight 80 persisted while business default changed to 10; switching to business weights read back 10. Failed QA capped the score at 49. Live AI explanation returned three authorised cited sources. Disabled QA and restricted commercial dimensions were excluded.
- D6: widget visibility/order, business weight and freshness changes saved and reloaded; status mapping did not change open totals or overdue warnings. Project health reflected the configured freshness.
- Access: actual viewer, member, Resource Manager and non-team employee browser checks passed. Viewer/member had no health-weight management or commercial card; direct business-settings access was refused. Non-team employee could not open the project. Project and business QA switches independently removed dashboard QA data.
- Mobile: 390×844 project selector, register navigation, menu-to-settings navigation and owner/restricted settings screens checked. No horizontal overflow after the fix; no browser runtime errors in completed flows.
- Regression: 181 checks across 24 test files passed. Five additional rolled-back settings checks passed (defaults, save/read-back, stale edit, Resource Manager read and no write). The earlier full database acceptance suites were not rerun in this execution.

## Failures fixed
1. Long business names plus the demo badge overflowed the phone header. The name now truncates and the demo badge is desktop-only.
2. A project with 2,105 RFIs showed only 1,000. Dashboard records/events, milestones, commercial inputs and linked register/report/file/change lists now use stable, uniquely ordered 500-row page reads. A later-page failure rejects the whole read rather than presenting partial totals. Regression tests cover 2,105 records and later-page failure.

## Restoration evidence
Temporary memberships were removed, the test login unlinked, the isolated fixture project archived and its demo business suspended. Append-only fixture histories remain in that suspended demo business. Existing memberships, module switches and dashboard settings matched their pre-test fingerprints exactly. Non-demo projects, records and commercial rows also matched their pre-test fingerprints exactly.

## Remaining dashboard scope
The previously recorded D3 source-programme-revision link and upcoming-four-weeks view remain outside this acceptance fix. This run is not a production-readiness certification.