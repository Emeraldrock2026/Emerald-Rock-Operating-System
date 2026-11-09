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
