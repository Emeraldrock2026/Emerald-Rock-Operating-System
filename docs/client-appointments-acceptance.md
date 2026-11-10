# Client appointments acceptance — 10/11/2026

## Delivered
- Client directory spreadsheet with horizontally scrollable columns and links to full profiles.
- Multiple project appointments, independent service stages/dates, contracting and invoicing entities, immutable identity snapshots, exact appointment-document version links.
- Reused shared contacts with project-specific roles; project viewers receive linked details only.
- Separately protected client defaults and appointment commercial terms; explicit copy, source version and appointment confirmation. A later default edit cannot update agreed terms automatically.

## Verified
- Signed-in isolated demo: spreadsheet to profile, save 30-day defaults, create a tender appointment and service stage, link the existing timesheet approver, copy/confirm terms, save £12,500, change defaults to 60 days and read appointment back still at 30 days/£12,500.
- Signed-in Resource Manager without commercial grant: operational contacts visible, commercial terms absent. Project viewer: read-only contacts, no link/edit action. Unassigned employee: project not found. Phone appointment navigation and 390px layout passed, no runtime errors.
- 191 domain/pagination regressions passed. Appointment SQL transaction: 18 checks passed and rolled back; additional project-manager contact, commercial restriction, whole-CRM restriction and cross-entity refusal: four checks passed and rolled back.
- The first live save exposed an unsupported audit category; corrected to the existing client category and repeated the same successful flow. A project-manager contact policy needed a narrow checked helper because whole-client RLS correctly hides contact rows; retested successfully.
- All temporary memberships and team links removed; isolated demo suspended with its audit history retained. Real client/project fingerprints and all original memberships checked against their before-test values.

## Coverage limits
- Full `tests/db/access_acceptance.sql` was extended, but its rerun through the CLI was refused as read-only; the focused write-capable rolled-back appointment transactions above did run. This is not a claim that the full suite passed again.
- Two engagements are covered by the SQL transaction; the browser exercised one staged appointment. Exact document-version selection is implemented but upload/link/download was not exercised end-to-end.
- Guided onboarding/readiness, exceptions, delegated permissions, sensitive-term review proposals, PO documents, affected-appointment review and external invitations remain later stages. Execution status and confirmation do not mean onboarding approval.