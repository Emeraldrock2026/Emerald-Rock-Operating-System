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
