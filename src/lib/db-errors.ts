/** Turns database/auth errors into plain British English. Database guards raise "CODE: message". */
const FRIENDLY: Record<string, string> = {
  SELF_CHANGE: "You can't change your own role, access or status. Ask another Owner/Admin.",
  LAST_OWNER: "A business must keep at least one active Owner/Admin.",
  ALREADY_MEMBER: "That person already has access to this business.",
  NOT_AUTHORISED: "You don't have permission to do that.",
  INVALID_EMAIL: "Enter a valid email address.",
  PLATFORM_ONLY: "Only a platform administrator can do that.",
  MODULE_DEPENDENCY_DISABLED: "Switch on the modules this one depends on first.",
  MODULE_HAS_DEPENDANTS: "Switch off the modules that depend on this one first.",
  PATTERN_REWRITES_HISTORY:
    "That date is in the past and this person already has work booked after it. Choose today or a later date.",
  ADMIN_ONLY: "Only an Owner/Admin can link or unlink a login.",
  NOT_A_MEMBER: "That login isn't a member of this business.",
  PROJECT_HAS_FUTURE_ALLOCATIONS: "This project still has work booked from today onwards. Move or remove that work first.",
  CLIENT_INACTIVE: "That client is inactive. Reactivate them or choose another client.",
  IMMUTABLE: "Project references never change.",
  CROSS_TENANT_REFERENCE: "That record belongs to another business.",
  EMPLOYEE_INACTIVE: "That person is inactive and can't be given new work.",
  PROJECT_NOT_ALLOCATABLE: "Only Active or On Hold projects can have work booked.",
  MODULE_NOT_AVAILABLE: "That module isn't switched on for this business. Ask your platform administrator.",
  NOT_PROJECT_MODULE: "That isn't a project module.",
  TEMPLATE_NOT_FOUND: "That template no longer exists or has been switched off.",
  BAD_FOLDER_PATH: "Folder paths need a name at every level, separated by /, up to 6 levels.",
  MODULE_NOT_ACTIVE: "That module is switched off for this project, so nothing new can be added.",
  BAD_FILE_PATH: "The upload didn't match this project. Please try again.",
  UPLOAD_MISSING: "The file didn't finish uploading. Use Retry.",
  FOLDER_NOT_IN_PROJECT: "That folder belongs to a different project.",
  FILE_VERSION_DIRECT: "Versions can only be added by uploading a file.",
  FILE_IMMUTABLE_FIELDS: "A file can't be moved to another project or module.",
  NOT_A_DRAWING: "That entry isn't a drawing.",
  REVISION_OUT_OF_SEQUENCE: "That revision doesn't follow this project's revision sequence.",
  REVISION_NOT_LATER: "A new revision must come after the latest one received.",
  BAD_DECISION: "Choose accept, amend or reject.",
  AMENDMENT_REQUIRED: "Write the amended wording before saving.",
  CHANGE_NOT_DRAFT: "That change is no longer a draft, so its findings can't be changed.",
  CHANGE_MODULE_OFF: "Change control must be switched on for this project before findings can be accepted.",
  NOT_ALLOWED: "You don't have permission to do that.",
  STALE_RECORD: "Someone else changed this record. Refresh the page and try again.",
};

export function friendlyError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
  const code = /^([A-Z_]+):\s*(.*)$/s.exec(message);
  if (code) return FRIENDLY[code[1]!] ?? code[2]!;
  if (/^[A-Z_]+$/.test(message.trim()) && FRIENDLY[message.trim()]) return FRIENDLY[message.trim()]!;
  if (/project_records_drawing_number_idx/.test(message)) return "That drawing number is already in the register.";
  if (/project_templates_name_idx/.test(message)) return "A template with that name already exists.";
  if (/project_team_project_id_employee_id_key/.test(message)) return "That person is already on the project team.";
  if (/clients_tenant_name_idx/.test(message)) return "A client with that name already exists.";
  if (/projects_planned_finish_date_check|planned_finish_date >= start_date/.test(message)) return "The planned finish date can't be before the start date.";
  if (/violates foreign key constraint/.test(message)) return "That choice isn't available in this business.";
  if (/employees_tenant_email_idx/.test(message)) return "Another person in this business already uses that email.";
  if (/employees_tenant_id_user_id_key/.test(message)) return "That login is already linked to another person.";
  if (/working_patterns_tenant_id_employee_id_effective_from/.test(message)) return "There is already a pattern starting on that date.";
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/rate limit/i.test(message)) return "Too many attempts. Wait a few minutes and try again.";
  if (/pwned|leaked|known to be weak|weak password/i.test(message))
    return "That password has appeared in a data breach. Choose a different one.";
  if (/failed to fetch|network/i.test(message)) return "We couldn't reach the server. Check your connection and try again.";
  return message || "Something went wrong. Please try again.";
}

export class StaleRecordError extends Error {
  constructor() {
    super("STALE_RECORD: changed by someone else");
  }
}
