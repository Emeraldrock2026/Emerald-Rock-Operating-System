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
- [ ] P5 Shared PDF service; progress reports; delay reports (issue history, no email yet)
- [ ] P6 Registers: RFIs, early warnings, programmes
- [ ] P7 QA, handover, RAMS, deliveries, procurement, assets & plant
- [ ] P8 Email issue (needs sending domain) — blocked: user chose later
- [ ] Stage 10 demo businesses + acceptance testing — after project modules
