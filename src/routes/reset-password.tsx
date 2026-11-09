import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CenteredPanel } from "@/components/app/centered-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/db-errors";

const MIN_PASSWORD = 10;

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { welcome?: string | undefined } => ({
    welcome: search["welcome"] === "1" || search["welcome"] === 1 ? "1" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Set your password — Emerald Rock OS" },
      { name: "description", content: "Choose a password for your Emerald Rock OS account." },
      { property: "og:title", content: "Set your password — Emerald Rock OS" },
      { property: "og:description", content: "Choose a password for your Emerald Rock OS account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type LinkState = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const { welcome } = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<LinkState>("checking");
  const [isInvite, setIsInvite] = useState(welcome === "1");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("type") === "invite") setIsInvite(true);
    const hashError = hash.get("error_description");
    if (hashError) {
      setLinkError(hashError.replace(/\+/g, " "));
      setState("invalid");
      return;
    }
    let settled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        settled = true;
        setState("ready");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setState("ready");
      }
    });
    const timer = window.setTimeout(() => {
      if (!settled) setState("invalid");
    }, 4000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
    setBusy(false);
    if (error) {
      setError(friendlyError(error));
      return;
    }
    toast.success("Password saved.");
    navigate({ to: "/select-business", search: { choose: undefined }, replace: true });
  }

  if (state === "checking") {
    return <CenteredPanel title="Checking your link…" />;
  }

  if (state === "invalid") {
    return (
      <CenteredPanel
        title="This link can't be used"
        description={
          <>
            <p>{linkError ?? "The link has expired or has already been used."}</p>
            <p className="mt-2">
              On the sign-in page, choose “Forgot your password?” and enter the email address you were invited with to get a new link.
            </p>
          </>
        }
      >
        <Button asChild className="w-full">
          <Link to="/auth" search={{ redirect: undefined }}>Go to sign in</Link>
        </Button>
      </CenteredPanel>
    );
  }

  return (
    <CenteredPanel
      title={isInvite ? "Welcome — set your password" : "Set a new password"}
      description={isInvite ? "You've been invited to Emerald Rock OS. Choose a password to finish setting up your account." : `Use at least ${MIN_PASSWORD} characters.`}
    >
      <form onSubmit={save} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="password-hint" />
          <p id="password-hint" className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters. Passwords found in known data breaches are rejected.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy || !password || !confirm}>
          {busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </CenteredPanel>
  );
}
