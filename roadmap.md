# Emerald Rock OS — Release 1 (multi-tenant brief)

- [x] Planning rules and automatic checks (dates, capacity, totals, modules, permissions, references)
- [x] Architecture, tenant model and permission matrix documented (docs/architecture.md)
- [x] Backend connected (Lovable Cloud)
- [ ] Connect GitHub (blocked: owner connects it in Settings)
- [x] First platform administrator email received
- [x] 1. Schema, tenant isolation policies, audit log (migrations) — 50 database checks pass
- [x] 2. Invitation sign-in, memberships, tenant switching, app layout, Users settings
- [x] 3. Platform administration: create, suspend/reactivate, invite first Owner/Admin, setup status
- [x] 4. Module configuration and enforcement
- [x] 5. Employee directory and effective-dated capacity
- [x] 6. Clients & Projects
- [x] 7. Commercial fields and restricted access
- [x] 8. Resource Planning (grid; list on small screens)
- [x] 9. Adaptive overview and CSV exports
- [ ] 9b. Audit history views (not yet requested)
- [ ] 10. Demo tenants (Emerald Rock, Harbour Planning Demo) and acceptance testing
- [ ] Before live use: separate production project, backup and recovery demonstrated

## Project modules (brief: Configurable Project Module, 09/11/2026)
Platform admin switches project modules per business; project admins pick from those per project. Email issue deferred.
- [x] P1 Foundation: project details (description, address, organisations, team, key dates, contract), project module catalogue + per-project selection, project templates, shared record structure (refs, status, history, comments, links), project dashboard
- [x] P2 Photos (mobile capture, multi-upload, folders, captions, previews) and Documents (folders, versions, permissions, default folder structure)
- [x] P3 Drawings register, revision matrix, upload-new-revision, latest vs authorised status
- [x] P4 AI drawing comparison + change control register (no duplicates, reviewer accepts findings)
- [x] P5 Shared PDF service; progress reports; delay reports (issue history, no email yet)
- [x] P6 Registers: RFIs, early warnings, programmes
- [x] P7 QA, handover, RAMS, deliveries, procurement, assets & plant
- [ ] P8 Email issue (needs sending domain) — blocked: user chose later
- [x] Stage 10 demo businesses + acceptance testing — after project modules

## Live project performance dashboard (brief: 09/11/2026)
Replace placeholder dashboard content with live metrics, charts, key-date comparisons, commercial forecasts and an explainable health score. Semantic status colours (green/amber/red/neutral), never colour alone; branding for ordinary series. "Not available" rather than zero for unimplemented metrics; missing budgets/forecasts shown as missing, never zero.
- [x] D1 Live KPI cards + layout: compact header, reporting-period controls (this week / this month / last month / custom), last-refreshed, metric definitions in src/lib/domain/dashboard.ts with tests, clickable cards opening filtered registers, consolidated outstanding actions from enabled modules
- [x] D2 Register and activity charts: RFI/EWN open-vs-closed + weekly raised-vs-closed + ageing, photo upload trend, reports issued by period, QA completions and pass/fail; chart segments open underlying records
- [x] D3 Milestones planned vs forecast: baseline/forecast/actual dates, variance in days (calendar vs working labelled), source programme revision, stale/missing forecast flags, upcoming 4 weeks; baselines never silently replaced (done: dates, calendar-day variance, flags, baseline history; open: link to source programme revision, upcoming-4-weeks view)
- [x] D4 Commercial forecast: budget basis per project (expenditure/revenue/cost), original budget + adjustments + forecast final account + variance, pending change exposure separate, "Forecast not entered" where absent, commercial permission enforced (done: basis type, original budget, append-only audited adjustments, basis-aware favourable/adverse variance, mobile + Resource Manager checked)
- [x] D5 Explainable health score: documented rule-based 0–100 score with per-project configurable audited weights, coverage/freshness, critical overrides, three priority actions, AI narrative via AI Gateway GPT-6.1 Terra (validated citations, separate facts/interpretation, failures leave score available); 173 domain tests, 22 isolated health permission checks and 66 full access checks pass; desktop/mobile + live Gateway explanation verified on Harbour demo only
- [x] D6 Dashboard settings: business-level ordered widgets, display-only register status mappings, default health weights and freshness thresholds; preserve/reset project weight overrides; 179 domain tests, 19 isolated settings checks and 71 full access checks pass; demo save/read-back/restore and phone layout verified, real projects untouched
- [x] D1–D6 combined acceptance: settings, project overrides, actual restricted browser roles, business/project switches, desktop/mobile navigation; fixed phone header overflow and 1,000-row truncation, verified 2,105-row exact links; 181 regressions pass. Temporary memberships removed, isolated demo suspended, existing access/settings/modules and real project fingerprints unchanged. Coverage/limitations: docs/dashboard-acceptance.md.

## Client onboarding and profiles (brief: 10/11/2026)
- [x] C1 Client profiles foundation: existing CRM client cards, company identity/group, reusable multi-role contacts, relationship/next action, unverified submissions, owner-reviewed verified profile changes and audit. Signed-in demo flow/mobile passed; 184 domain tests and 14 rolled-back profile access/guard checks passed. Existing role boundaries retained; logos, configurable delegation, client documents, payment/opportunity data and default/appointment impact review remain later scope.
- [x] C2 Appointments: multiple engagements, explicit entities, staged services, contact links, frozen identity and confirmed commercial defaults; client spreadsheet. Signed-in isolated owner/RM/viewer/unassigned and phone checks passed; 191 regressions and 22 rolled-back appointment checks. Temporary access removed and demo suspended; real fingerprints unchanged. Coverage limits and deferred PO-document/sensitive-review work: docs/client-appointments-acceptance.md.
- [ ] C3 Guided onboarding: configurable required fields, pending information, separate proposal/commencement/invoice readiness, authorised exceptions and approvals.
- [ ] C4 Extended CRM: opportunities, payment RAG, client documents/activity, delegated field permissions, affected-appointment review, protected exports/search/AI.
- [ ] C5 Optional external submissions: secure expiring invitations and internal review queue; sending deferred.

## Interface improvement programme (brief: 10/11/2026)
Sharper, more compact interface; targeted CRM/onboarding/project-setup fixes. Preserve data and functionality; no rebuilds or duplicate structures. Staged per brief; owner chose to work through all stages.
- [x] I1a Stage 1 (part): PageHeader with breadcrumb/status/primary-action slots; client directory uses stable short references CLI-0001… (immutable internal CL-… kept; allocation guarded, never renumbered); Mark inactive moved to overflow menu; client profile rebuilt with one compact header (badges, reference, legal name, group) and tabs Overview / Company / Contacts / Appointments / Commercial defaults / Activity & history; overview shows owner, primary contact, next action, identity progress, live projects, outstanding setup; placeholder "Not available" metrics removed. Verified desktop + phone, no overflow, 189+3 domain tests pass.
- [x] I2a Stage 2 (part): legacy card contacts migrated into shared contacts (D Morgan, Morgan Sindall); "Existing CRM contact" split removed; duplicate contacts flagged for review (never auto-merged).
- [x] I2b Structured client fields: relationship owner = active business user select; regions/sectors configurable multi-select; client type selection; next action with owner/due/status; accounting contact ID restricted; prospect-with-live-projects review prompt. Owner select from active members, configurable region/sector/client-type options (managers edit via Field options), next action owner/due/done, admin-only accounting ID, unmapped values preserved and flagged; guard whitelist extended; verified save/read-back, real record restored.
- [ ] I3 Stage 3: appointment onboarding staged form (client/scope → contacts → appointment & PO → invoicing → review) with draft saving; PO document capture; readiness indicators (appointment/PO/invoicing route) and proposal/commence/invoice readiness with configurable requirements; missing items become assigned actions; authorised commencement exceptions with reason + follow-up + audit.
- [ ] I4 Stage 4: module clarity (business-available vs project-enabled vs implemented); project setup checklist (team, appointment, scope, modules, key dates, commercial baseline); project dashboard sharpening (compact header, collapsed health methodology, "Not set" commercial).
- [ ] I5 Stage 5: permission review — separate resource-allocation authority from client identity/appointment/fee/project-config authority; verify backend enforcement, exports and AI explanations; responsive + light/dark sweep; final summary of changes/migrations/tests/gaps.
