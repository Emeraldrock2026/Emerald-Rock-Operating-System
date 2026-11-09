# Emerald Rock OS — architecture and permission model

## Platform
- One shared app and one shared database. Every tenant-owned row carries `tenant_id`.
- Database: the owner's own Supabase project. Schema changes are versioned migrations.
- Environments: the connected project is development/test. Production will be a second, separate
  project before live business use. The app shows the current environment in its header.
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

## Platform administration
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

## Planning rules (see `src/lib/domain/`)
- Allocation dates are date-only values. Capacity comes from effective-dated working patterns.
- Allocated = sum of hours; remaining = capacity − allocated; over-allocation = anything above.
- Planned allocation % = allocated ÷ capacity; shown as "No capacity configured" when capacity is 0.
- Capacity excludes leave and public holidays in Release 1.

## Future modules (roadmap only — not built, cannot be enabled)
Timesheets & Approvals · Expanded Commercial Reporting · CRM & Opportunities · Programme & Project
Controls · NEC/JCT Contract Registers · Documents & Project Governance · People & HR · Assets &
Equipment · Property · Advanced Reporting & Integrations.
