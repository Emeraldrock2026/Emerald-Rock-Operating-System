<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Business rules (capacity, totals, module dependencies, permission matrix, project references) live as pure functions in `src/lib/domain/` with tests beside them; UI and server code call these rather than re-implementing them, so the rules are tested once.
- Allocation and capacity dates are date-only `YYYY-MM-DD` strings, never Date objects, so timezone conversion cannot shift work to another day.
- Tenant isolation is enforced in the database (tenant_id on every tenant row, composite tenant foreign keys, membership- and module-checked policies); `src/lib/domain/permissions.ts` only mirrors it for the UI.
- Architecture and the permission matrix are documented in `docs/architecture.md`; keep it in step with schema changes.
- Database access rules are verified by `tests/db/access_acceptance.sql` (one rolled-back transaction); extend and re-run it whenever policies, guards or tables change.
- Business-scoped pages live under `src/routes/_authenticated/t.$tenantId.*` and their query keys start with `["tenant", tenantId, …]`, so switching business can drop other tenants' cache and direct links always name the business.
- Navigation items are derived from `can()` in `src/components/app/app-shell.tsx`; add an item only when its page exists, its module is enabled and the role permits it.
- Every module page wraps its content in `RequireModule` (src/components/app/require-module.tsx) and is listed in navigation only when its module is on, so direct links to switched-off modules show a clear message while the database still refuses the data.
- AI rebalancing suggestions are re-checked by validateProposals in src/lib/domain/rebalance.ts before display; never show or save raw model output, since it can break capacity rules.
- Business branding is applied as CSS variables on <html> by AppShell (brandStyle in src/lib/branding.ts, .brand-scope in styles.css) and only overrides primary/ring/navigation tokens, so status colours never follow branding and portals match.
- Light/dark: personal choice in user_preferences, business default on tenants; localStorage mirrors both for the no-flash head script in __root.tsx (src/lib/appearance.ts).
- Project-level modules live in the same `modules` catalogue (kind='project'); a project module is usable only when on for the business (platform admin) AND chosen for the project (`project_module_active()`), so one switch path enforces both. Project access goes through `can_view_project` / `can_contribute_project` / `can_manage_project` helpers.
- Register-style items in every project module share `project_records` (auto references PROJECT-MOD-0001, links, comments, audit); add module-specific columns via `fields` or a side table rather than a new parallel record system.
- Project files are stored once in the private project-files bucket and registered only via record_project_file_version(); storage policies parse the path, so access follows project roles and module switches without copying files.
- Database permission helpers must return true/false, never null (wrap in coalesce), because plpgsql 'if not helper()' silently passes on null.
- AI comparison findings are saved only by the server via save_drawing_comparison() (service role) after can_compare_drawing() passes as the user, so users cannot insert fabricated findings directly.
- Issued reports are built in the browser (src/lib/report-pdf.ts) only from a frozen snapshot, stored as a project file version and registered via issue_project_report(), which checks project admin, module, stale version and duplicate content hash; report_issues has no write policies, so issued copies never change.
- Register status rules for every register-style project module are enforced by guard_register_record() and mirrored in REGISTERS in src/lib/domain/registers.ts (add a module to both); record reference codes come from record_reference_code() so modules with similar names never share a code.
- Project dashboard figures come from src/lib/domain/dashboard.ts (periodRange, moduleKpis, consolidatedActions) and only count modules active for the project; reads rely on project_records RLS, so no extra permission logic lives in the UI.
- Milestone baselines change only through set_milestone_baseline() (project admin, reason required after the first) and every baseline is kept in append-only milestone_baselines; the database stamps forecast_updated_on, and variance/stale rules live in src/lib/domain/milestones.ts. Milestones follow the Programmes project module switch.
- Change estimates live in change_estimates (commercial-access policies), never in project_records fields, so project viewers never receive money values; forecast/variance/exposure rules live in src/lib/domain/commercial.ts and missing values display as 'Forecast not entered'/'Not estimated', never zero.
- Budget basis (revenue/expenditure/cost) and original budget sit on project_commercials; budget_adjustments is append-only (guard trigger refuses update/delete) and audited, and current budget = original + adjustments via basisForecast in src/lib/domain/commercial.ts, so every comparison uses the same basis rules.
- Health scoring lives in domain/health.ts; the authenticated health function reads every page as the user, excludes inactive modules and restricted commercial inputs, and validates AI citations against that fresh snapshot so the model cannot supply scores or private facts.
