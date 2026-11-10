# Emerald Rock OS — architecture and permission model

## Platform
- One shared app and one shared database. Every tenant-owned row carries `tenant_id`.
- Database: Lovable Cloud. Schema changes are versioned migrations.
- Environments: today one Lovable Cloud database serves both the preview and any published app.
  A separate production environment must be set up before live business use. The app shows the
  current environment in its header.
- Privileged keys stay server-side; the browser only holds the publishable key.

## Tenancy
- `tenants` (business settings, branding, status managed by the platform).
- `tenant_memberships` (user, tenant, role, status, commercial grant, invited/activated info).
  User identity (auth) is separate from membership. One user can hold several memberships.
- Access check used by every policy: `is_active_member(tenant_id)` = membership active AND tenant
  active, resolved from `auth.uid()` — never trusted from the browser.
- Cross-tenant links are blocked with composite foreign keys `(tenant_id, id)`, e.g. a project's
  `(tenant_id, client_id)` must reference `clients(tenant_id, id)`.
- Switching tenant clears all cached data before the next tenant loads.
- Files (logos): private bucket, access by membership lookup, not by folder name.

## Sign-in and navigation
- Email and password only; public sign-up is switched off. New people arrive through an invitation
  email and choose a password on `/reset-password?welcome=1`; existing logins are added directly and
  their invitation activates on next sign-in (`activate_my_memberships()`).
- Every business page lives under `/t/<tenantId>/…`, so direct links name the business and all
  cached data is keyed by tenant; switching business drops other tenants' cached data.
- `/select-business` returns people to their last business (stored per user in the browser) or lets
  them choose; single-business users go straight in.

## Platform administration

- Area at `/admin` (businesses list) and `/admin/businesses/<id>` (setup, Owner/Admins, suspend/reactivate). Setup counts come from `platform_tenant_overview()` (platform admins only; counts and module ids, no operational rows); setup stages are defined in `src/lib/domain/tenant-setup.ts`.
- `platform_admins` table, seeded only by a migration/SQL run by the owner. No public form or flag.
- Platform admins manage tenants, tenant status, initial owner invitations and module availability.
- Platform admin status grants **no** read access to tenant operational data (employees,
  projects, allocations, budgets). Infrastructure administrators of the backend provider can still
  access the database directly; this design does not prevent that.
- No impersonation or "view as tenant" in Release 1.

## Modules
| Identifier | Module | Depends on |
|---|---|---|
| (core) | Auth, memberships, roles, settings, module config, audit, employee directory & capacity | — |
| `clients_projects` | Clients & Projects | — |
| `resource_planning` | Resource Planning | `clients_projects` |
| `commercial` | Commercial (agreed fee, budget hours) | `clients_projects` |

- `tenant_modules` (tenant, module, enabled, changed_by, changed_at). Only platform admins write it.
- Policies on module-owned tables require `module_enabled(tenant_id, '<module>')`, so a disabled
  module rejects direct data access, not just navigation. Data is kept when disabled.
- Enable is blocked while a dependency is off; disable is blocked while a dependant is on.

## Permission matrix (tenant)
| Capability | Owner/Admin | Resource Manager | Employee |
|---|---|---|---|
| Tenant settings, users, invitations | Yes | No | No |
| Tenant audit history | Yes | No | No |
| Employee directory & capacity (manage) | Yes | Yes | Own record only (read) |
| Clients (view/manage) | Yes | Yes | No |
| Projects (view/manage) | Yes | Yes | Read basic details of allocated projects |
| Allocations (view all/manage) | Yes | Yes | View own only |
| Commercial fee & budget hours | Yes | Only with commercial grant | No |
| Commercial change history | Yes | Only with commercial grant | No |

Commercial values live in a separate `project_commercials` table so the restriction is enforced by
its own policies. The rules are mirrored in `src/lib/domain/permissions.ts` for the UI; the
database policies are the source of truth.

## Database objects (migrations in `drizzle/migrations/`)
- Core: `tenants`, `modules`, `tenant_modules`, `tenant_memberships`, `platform_admins`,
  `platform_admin_bootstrap` (service-only), `audit_log` (append-only).
- Operational: `employees`, `working_patterns`, `clients`, `projects`, `project_reference_counters`
  (service-only), `project_commercials`, `allocations`.
- Every editable table has `created_at/by`, `updated_at/by` and `version` (bumped on each update) so
  the app can detect stale edits by updating `where version = <seen>`.
- Allocations carry an optional `client_request_id` (unique per tenant) to make retries safe.
- Guards raise errors with stable prefixes the UI can translate, e.g. `EMPLOYEE_INACTIVE`,
  `PROJECT_NOT_ALLOCATABLE`, `PROJECT_HAS_FUTURE_ALLOCATIONS`, `PATTERN_REWRITES_HISTORY`,
  `MODULE_DEPENDENCY_DISABLED`, `MODULE_HAS_DEPENDANTS`, `SELF_CHANGE`, `LAST_OWNER`,
  `PLATFORM_ONLY`, `CURRENCY_LOCKED`, `CROSS_TENANT_REFERENCE`.
- Working patterns: a change may not alter capacity on past dates that already have allocations;
  add a new pattern from today instead.
- First platform admin: an approved email in `platform_admin_bootstrap` calls
  `claim_platform_admin()` after signing in with a confirmed email; the entry is then consumed.
- `tests/db/access_acceptance.sql` exercises isolation, roles, modules and guards inside one
  transaction that always rolls back. Expected result: `RESULT passes=71 fails={}`.

## Planning rules (see `src/lib/domain/`)
- Allocation dates are date-only values. Capacity comes from effective-dated working patterns.
- Allocated = sum of hours; remaining = capacity − allocated; over-allocation = anything above.
- Planned allocation % = allocated ÷ capacity; shown as "No capacity configured" when capacity is 0.
- Capacity excludes leave and public holidays in Release 1.

## Future modules (roadmap only — not built, cannot be enabled)
Timesheets & Approvals · Expanded Commercial Reporting · CRM & Opportunities · Programme & Project
Controls · NEC/JCT Contract Registers · Documents & Project Governance · People & HR · Assets &
Equipment · Property · Advanced Reporting & Integrations.

## Module switches (stage 4)
Platform admins switch modules per business on the business page. The UI uses `switchBlockedReason()`; the database trigger `guard_tenant_module` enforces dependencies and every module table's policies call `module_enabled()`. Changes are audited (category `module`). Module pages use `RequireModule`; open sessions refresh business context every minute.

## People and working hours (stage 5)
`/t/<id>/people` lists employees (Employees see only their own linked record as "My hours"); `/t/<id>/people/<employeeId>` edits details, active status, the linked login (Owner/Admin) and working patterns. A new pattern applies from its date until the next one; earlier weeks keep their old hours. `guard_working_pattern` refuses past-dated changes once work is booked after that date; only upcoming patterns can be removed. Period and validation rules: `src/lib/domain/working-patterns.ts`.

## Clients & Projects (stage 6)
`/t/<id>/clients`, `/t/<id>/projects`, `/t/<id>/projects/<projectId>`, each wrapped in `RequireModule("clients_projects")`. `guard_project_client` refuses inactive clients on new or re-pointed projects (`CLIENT_INACTIVE`). Employees cannot read `clients`; `my_project_client_names(tenant)` returns client names only for projects the caller may see. Status changes offered in the UI come from `allowedStatusTransitions()`; closing still needs future allocations resolved (`guard_project_status`).

## Commercial
Fee and budget hours live in project_commercials (one row per project), readable/writable only via has_commercial_access (module on + Owner/Admin or Resource Manager with grant). History is read from audit_log category commercial.

## Resource planner
Weekly grid at /t/:tenantId/planner (RequireModule resource_planning). Capacity per day comes from the effective-dated working pattern for that date (capacityOn); over-allocation, out-of-dates and On Hold bookings need confirmation in the UI; the database refuses inactive people and Draft/Completed/Archived projects. Employees see only their own row, read-only.

## Rebalancing suggestions
suggestRebalance (src/lib/rebalance.functions.ts) runs as the signed-in user (RLS), requires is_tenant_manager + resource_planning, sends only this business's week (ids, names, job titles, hours; no emails or commercial data) to the AI Gateway, then filters every proposal through validateProposals (src/lib/domain/rebalance.ts). Changes are saved only after the user confirms, version-checked.

## Branding and appearance
Tenants carry brand_colour (primary), accent_colour (navigation), logo_path, logo_dark_path and default_appearance; Owner/Admins edit them (existing tenant update policy). Logos are in the private tenant-branding bucket under <tenant_id>/, readable by members, writable by that business's Owner/Admins; shown through short-lived signed links. user_preferences holds each person's Light/Dark/System choice (own row only). Checks: tests/db/branding_acceptance.sql.

## Overview cards and CSV exports (stage 9)
Which cards and exports a person gets is decided by `overviewCards` / `availableExports` in `src/lib/domain/exports.ts`, derived from `can()`. Exports are built in the browser from ordinary reads, so row-level policies (tenant, module switches, role, commercial grant) decide every row; the fees export only exists for people with commercial access while Commercial is on. Cells that start with = + - @ are prefixed with ' to stop spreadsheet formula injection.

## Project groundwork (project stage 1)
- Project modules (15) sit in `modules` with kind='project'. Platform admin switches them per business; project admins (Owner/Admin, Resource Manager, or a project team member with role Project admin) choose from those per project (`project_modules`). Switching off hides records and blocks new ones; Project admins can still read historic records.
- `project_team` (project_admin / member / viewer), `project_organisations`, `project_key_dates`, `project_folders`, project fields for description, address and contract.
- `project_templates` (Owner/Admin): modules + folder paths; `apply_project_template()` skips modules not on for the business.
- Shared records: `project_records`, `record_links` (target shown via `linked_record_summary()`, which explains restrictions rather than breaking), `record_comments`; all audited under category project_detail. `project_activity()` feeds the project dashboard.
- Checks: tests/db/project_foundation_acceptance.sql and the project section of access_acceptance.sql.

## Project photos and documents (stage P2)
- `project_files` (one row per photo/document, module `photos` or `documents`, optional folder, caption, tags) and append-only `project_file_versions`.
- Files live in the private `project-files` bucket at `<tenant>/<project>/<module>/<file>/<upload>-<name>`. Storage policies parse the path: read = can_view_project and (module active or project manager); upload = can_contribute_project and module active. No update/delete policies, so versions are immutable.
- New files and new versions are registered only through `record_project_file_version()`, which re-checks access, the path and that the object exists; `current_version` cannot be changed directly.
- Contributors can add folders while Photos or Documents is active. Checks: `tests/db/project_files_acceptance.sql`.

## Drawing register (stage P3)
- A drawing is a `project_records` row (module `drawings`, `fields.number` unique per project, `fields.discipline`). Its files are one `project_files` row (module `drawings`) whose versions back each revision.
- `drawing_revisions`: revision code, rank (series order then number), revision date, received date, file version, and a separate `authorised` flag (at most one per drawing). Inserted only by `add_drawing_revision()`, which enforces the project's sequence (`drawing_register_settings`: series such as P,C or A-Z, digit count) and that each revision is later than the latest. Uploading never authorises; `set_drawing_authorised()` is project-admin only and refused when the module is off.
- `drawing_revision_rank()` mirrors `parseRevision` in src/lib/domain/drawings.ts. Checks: `tests/db/drawings_acceptance.sql`.
- Project access helpers (`can_view/contribute/manage_project`, `project_module_active`) always return true/false (migration 0012); before that a null result let `if not ...` checks in functions pass.

## AI drawing comparison and change register (stage P4)
- `compareDrawingRevisions` (src/lib/compare.functions.ts, signed-in) checks `can_compare_drawing()` as the user, reads both revision files through the user's own access, sends them to the AI Gateway, cleans the output with `cleanFindings` (src/lib/domain/comparison.ts), then stores the run with `save_drawing_comparison()` (server-only, service role). Failed or unreadable runs are recorded as failed with no findings.
- `comparison_findings` are unique per (from revision, to revision, fingerprint), so reruns update "last seen" and never duplicate; reviewer decisions survive reruns.
- `review_comparison_finding()` (project admins, Drawings on): reject, accept or amend. Accept/amend needs Change control on and creates or appends to one draft `project_records` change (module change_control) per revision pair, linked to the drawing. Findings in a non-draft change are locked. No approval, entitlement or valuation fields exist.
- Checks: `tests/db/comparison_acceptance.sql` (run via the SQL tool).

## Progress and delay reports (P5)
- Drafts are `project_records` (modules progress_reports / delay_reports) with content in `fields`; contributors draft, project admins issue.
- Issuing builds a branded PDF from a snapshot, stores it in project-files under the report module, and calls `issue_project_report()`. `report_issues` (select-only) keeps issue number, snapshot, content hash and exact file version. Identical re-issues are refused (DUPLICATE_ISSUE); edits after loading are refused (STALE_EDIT).
- Module off: no new drafts or issues; project admins still see history. Checks: tests/db/reports_acceptance.sql.

## RFIs, early warnings and programmes (P6)
- All three are `project_records`; module fields live in `fields`. Shared comments (`record_comments`) and links (`record_links`, shown through `linked_record_summary`, which explains restricted links) are used by every register.
- `guard_register_record()` checks allowed statuses, sets `is_closed`, needs a response before an RFI is responded/closed, and a programme file before a programme is current. Closing, reopening, making current or superseding is for project admins. Making a programme current supersedes the previous one.
- Stage P7 adds QA, handover, RAMS, deliveries, procurement and assets and plant to the same guard: QA needs a result before passed/failed; procurement needs a supplier before awarded/ordered; handover and RAMS need a file before submitted/accepted/approved, and once accepted/approved the file cannot be swapped (`FILE_LOCKED`). Uploading never changes status, so RAMS are only approved by a project admin. Admin-only statuses: QA closed, handover accepted, RAMS approved/rejected/superseded, delivery cancelled, procurement awarded/closed. Closed records get `completed_on`. Checks: `tests/db/registers_stage7_acceptance.sql`.
- A procurement package can only become ordered from awarded (`guard_procurement_order()`, `ORDER_NEEDS_AWARD`), so the admin-only award step cannot be skipped.
- Reference codes: `record_reference_code()` (e.g. PRO progress reports, PRG programmes, DEL delay reports, DLV deliveries, PCM procurement).
- Checks: tests/db/registers_acceptance.sql.

## Milestones (dashboard stage 3)
- `project_milestones` (baseline, forecast, actual, database-stamped forecast_updated_on) follows the Programmes project module: viewers read while it is on, project admins also read historic; project admins add, contributors update forecast/actual.
- Baselines change only via `set_milestone_baseline()` (project admin, module on, version check, reason for any re-baseline). Every baseline is written to append-only `milestone_baselines`; direct baseline updates are refused (BASELINE_LOCKED).
- Checked by `tests/db/milestones_acceptance.sql`.

## Commercial forecast (dashboard stage 4)
- `project_commercials` also holds forecast_final_account, forecast_note and database-stamped forecast_updated_on (same commercial-only policies).
- `change_estimates` (one per change register item) is readable only with commercial access on projects the person can view; writes need change control on for the project. Checked by `tests/db/commercial_forecast_acceptance.sql`.

### Budget basis and adjustments (dashboard stage 4)
- `project_commercials.budget_basis` (revenue | expenditure | cost) and `original_budget` (backfilled from agreed fee). Same commercial-access policies as the fee.
- `budget_adjustments`: append-only (guard trigger raises ADJUSTMENT_LOCKED on update/delete), reason required, non-zero amount, audited under 'commercial'. Read/insert need commercial access and project view. Verified by `tests/db/budget_basis_acceptance.sql`.
- Variance compares forecast with original + adjustments; on revenue a higher forecast is favourable, on expenditure/cost it is adverse.

## Health score (dashboard stage 5)
- `project_health_settings`: per-project relative integer weights 0–100 (defaults actions 30, milestones 30, QA 20, commercial 20). At least one positive. Read: project viewer with Clients & Projects on. Insert/update: project manager with module on. Composite project FK, version stamps and append-only audit events; no delete grant.
- `getProjectHealth` authenticates every request, checks project/business access and active modules, reads all pages under user RLS and calculates `projectHealth` in `src/lib/domain/health.ts`. Commercial inputs are never read or returned without `has_commercial_access`. No shared health score cache/table: users with different access can see different explicitly scoped scores.
- Rule version 1: dated open actions = share not overdue ×100; milestones = average clamp(100 − positive variance in calendar days ×100/28 −25 if stale); QA = passed/(passed+failed) ×100; commercial = clamp(100 − adverse variance/current adjusted budget ×500 −25 if stale). Actual milestone date takes precedence. Positive budget is required; revenue shortfall and expenditure/cost overrun are adverse. Forecast update older than 28 days or absent is stale. Pending estimated changes remain separate.
- Available positive-weight dimensions are normalised; missing never means zero or success. Coverage = available weight/applicable positive weight; disabled/restricted/zero-weight inputs are excluded. Missing/stale inputs make the score provisional. Green ≥80, amber ≥50, red <50. Unresolved failed QA or an unachieved milestone >14 days late caps at 49 regardless of weights. No available data means Not available.
- Three priority actions are deterministic, ordered by adverse/missing/stale severity then label. Gateway GPT-6.1 Terra (user-selected permitted alternative) writes interpretation only from the first 40 authorised evidence sources; citation IDs are validated, supplied facts displayed separately, no automatic generation/replay or saving. AI failure leaves scoring intact. Evidence links open register items or the milestones/commercial section.
- Checks: `health.test.ts` and rolled-back `tests/db/health_acceptance.sql`; all real projects remain untouched.

## Business dashboard configuration (dashboard stage 6)
- `tenant_dashboard_settings` holds validated ordered/visible widgets, display-only register status colours, default health weights and separate milestone/commercial freshness thresholds (integer 1–365 calendar days). No row means the original six widgets, 30/30/20/20 weights and 28-day freshness, so deployment does not write to existing businesses.
- Read: active business member with Clients & Projects on; write: business Owner/Admin with that module on. No delete grant. Database validation, version stamps and append-only audit prevent invalid settings, stale edits and cross-business writes. Settings contain no project facts or commercial values; every dashboard read still uses project/module/RLS access.
- Widgets render in configured order. Hiding a widget does not delete records or remove its inputs from health. Disabled modules and restricted commercial widgets remain unavailable even when configured visible.
- Business weights are live defaults for projects without explicit overrides. Existing project weights remain explicit overrides. Project managers can save overrides or select “Use business weights”; the latter sets `inherit_business_weights` without deleting history. Business admins do not silently overwrite project choices.
- Freshness is strictly older than the chosen threshold, or missing an update date; milestone flags, commercial warning and health stale deductions agree. Scoring formulas, 14-day milestone critical override and unresolved failed-QA override are unchanged.
- Status colours label dashboard outstanding-action statuses only. They never change open/closed totals, QA pass/fail charts, deadlines, approvals or health outcomes. Colour labels and overdue warnings remain visible. Business/project module switches retain authority.
- Changes apply on dashboard load/refetch; saving invalidates this business's cached reads. AI explanations always calculate from a fresh authorised snapshot including current settings.
- Tests: `dashboard-settings.test.ts`, `tests/db/dashboard_settings_acceptance.sql`, and the extended full access acceptance transaction; fixtures are isolated and rolled back.
- D6 verification: 179 domain checks, 19 settings permission/validation checks and 71 full access checks passed. Demo settings were saved/read back/restored through the UI; existing project overrides survived, freshness applied, desktop/phone rendering had no overflow or runtime errors. Real business/project data was not edited.

## Client profiles (C1)
- Existing `clients` remain the legal-entity anchor, with whitelisted non-financial identity/relationship JSON, an immutable internal reference, optional tenant-composite `client_groups` link and evidence-stamped identity verification. No existing clients are copied, merged or automatically verified.
- `client_contacts` stores one person's multiple roles per client. Existing inline CRM contacts and project organisations are retained; linking those to future appointment roles requires deliberate reconciliation, not automatic matching.
- C1 uses the existing safe access boundary: active business managers with Clients & Projects enabled view/create/edit identity and contacts. Employees/project viewers do not gain whole-client access; platform administrator status alone grants none. Only business Owner/Admin verifies identity or accepts/rejects proposals. Delegated/project-scoped profile projections and configurable field permissions are later scope, not claimed as implemented.
- `client_profile_changes` is read-only through the Data API; authenticated guarded functions submit/review proposals. After identity is verified, name/profile/group edits require a proposal. Acceptance version-checks the original, records the decision and resets verification; evidence must be checked again. Direct verification stamps and verified identity replacements are refused by a trigger. Client/contact/group/proposal changes use append-only audit; owners alone can read this history under existing policies.
- Company numbers remain text, including leading zeroes. UK number formats are checked; other jurisdictions remain unverified rather than applying UK rules or pretending a registry lookup occurred. Recording an identity check requires complete core identity fields and an explicit evidence source. Placeholder information stays incomplete.
- Relationship status, identity completeness/verification and onboarding approval are distinct. Onboarding approval remains Not assessed. Opportunity/payment measures are Not available, never invented; no commercial, debt or payment defaults are permitted in profile JSON. No new exports, notifications, documents or AI exposure are enabled in this stage.
- Existing project financials, signed/issued files and project fields are never mutated by a client profile update. Guided readiness rules and external submissions remain later stages.

## Client appointments (C2)
- Multiple `project_appointments` per project store independent services, date-only stages, explicit contracting/invoicing entities and frozen entity-name snapshots. Entity/project links are immutable after creation; client changes never synchronise into appointments.
- Read requires `can_view_project`; create/edit requires `can_manage_project`, both of which enforce business membership and Clients & Projects availability. Appointment contacts are links to existing active contacts of either named entity, not copies. Narrow authenticated functions return only linked contact details to project viewers and selectable entities/contacts to project managers; they do not unlock the whole client directory.
- `client_commercial_defaults` and `appointment_commercials` are separately commercial-protected. Commercial appointment access additionally requires project visibility; editing additionally requires project management. No commercial values live in operational records, identity JSON, exports or AI inputs.
- Default copying is explicit, captures source version and resets confirmation. Later client-default edits never rewrite appointment terms. Service stages have separate scope and dates; fees are never presumed to cover another engagement.
- Appointment documents link an exact existing project file version, checked against that project's module availability. No files are duplicated. Stamped versions support stale-edit refusal and changes are audited through client/commercial categories.
- The client directory is now a horizontally scrollable spreadsheet with linked client names; profile summaries remain at the top of individual profiles.
- Guided approvals/readiness, configurable delegation, PO document handling and affected-appointment review remain later scope; execution status and term confirmation are not onboarding approval.
