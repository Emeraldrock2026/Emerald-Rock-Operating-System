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
