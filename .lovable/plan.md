# Stage 6 — Clients & Projects

The database tables, protections and automatic project references already exist from stage 1. This stage adds the screens and wires them to those rules.

## What people will see
- **Clients** page (Owner/Admin and Resource Manager): list with search and "show inactive", add client (name, contact name, contact email), edit, mark inactive or reactivate. Clients are never deleted. Inactive clients can't be picked for new projects.
- **Projects** page:
  - Owner/Admin and Resource Manager see every project. They can filter by status and client, and search by reference or name.
  - Employees see only the projects they're allocated to. They get basic details only: reference, name, client, status and dates.
- **New project**: name, client (optional), project manager (from active People), start date, planned finish date, scope. The reference (for example ERC-0001) is given automatically and never reused or changed.
- **Project page**: details, status changes (Draft, Active, On Hold, Completed, Archived) with a confirmation, and an edit form. Saving checks whether someone else changed the record first. If a project still has future work booked, moving it to Completed, Archived or Draft is refused with a plain explanation.
- **Placeholders:** space for commercial values (stage 7) and allocations (stage 8), shown only when those modules are on.
- **Menu and links:** Clients and Projects appear in the menu only when Clients & Projects is switched on and the role allows it. Direct links to a switched-off module show the "isn't switched on" message.
- **Overview:** shows live counts of active clients and active projects, when the module is on.
- Dates show as DD/MM/YYYY.

## Checks
- Automatic checks for new rules:
  - which status changes are offered
  - finish date not before start date
  - client choices exclude inactive clients
  - project search and filters
- Database check set extended and re-run:
  - an Employee can't see unallocated projects or any clients
  - another business's client can't be linked
  - references keep counting up per business
  - everything is refused when the module is off
- Browser walkthrough with a temporary Owner/Admin login, which is deleted afterwards.

## Technical details
- Routes: `t.$tenantId.clients.index.tsx`, `t.$tenantId.projects.index.tsx`, `t.$tenantId.projects.$projectId.tsx`, all wrapped in `RequireModule("clients_projects")`. Query keys are `["tenant", id, "clients" | "projects"]`.
- Pure rules are in `src/lib/domain/projects.ts`: `allowedStatusTransitions`, `validateProjectDates` and `filterProjects`, with tests.
- Version-checked updates use the existing `StaleRecordError` pattern. Add friendly messages for `PROJECT_HAS_FUTURE_ALLOCATIONS`, `CROSS_TENANT_REFERENCE`, `IMMUTABLE` and the duplicate client name.
- Nav items are added through `can("clients.view")` and `can("projects.view_all" | "projects.view_allocated")`.
- If the policy review shows a gap, there will be one small migration, for example blocking inactive clients on new projects with a trigger. Docs, roadmap and the test count are updated.
