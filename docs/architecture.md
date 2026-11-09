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
  transaction that always rolls back. Expected result: `RESULT passes=59 fails={}`.

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
