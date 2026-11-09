import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CenteredPanel } from "@/components/app/centered-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { friendlyError } from "@/lib/db-errors";

/** Only same-origin paths are honoured after sign-in. */
function safeRedirect(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Emerald Rock OS" },
      { name: "description", content: "Sign in to Emerald Rock OS. Access is by invitation only." },
      { property: "og:title", content: "Sign in — Emerald Rock OS" },
      { property: "og:description", content: "Sign in to Emerald Rock OS. Access is by invitation only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "forgot">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const goOn = () => {
    if (redirect) navigate({ to: redirect, replace: true });
    else navigate({ to: "/select-business", search: { choose: undefined }, replace: true });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goOn();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(friendlyError(error));
      return;
    }
    goOn();
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(friendlyError(error));
      return;
    }
    setResetSent(true);
    toast.success("Check your email for a link to set a new password.");
  }

  if (mode === "forgot") {
    return (
      <CenteredPanel
        title="Reset your password"
        description="Enter the email address you were invited with. We'll send a link to set a new password."
      >
        {resetSent ? (
          <Alert>
            <AlertDescription>
              If an account exists for {email.trim()}, a link is on its way. It can take a few minutes; check your spam folder too.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={sendReset} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">Email</Label>
              <Input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <Button variant="link" className="mt-4 px-0" onClick={() => { setMode("sign-in"); setResetSent(false); setError(null); }}>
          Back to sign in
        </Button>
      </CenteredPanel>
    );
  }

  return (
    <CenteredPanel
      title="Sign in"
      description="Access is by invitation only. If you need access, ask your administrator to invite you."
    >
      <form onSubmit={signIn} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy || !email.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <Button variant="link" className="mt-4 px-0" onClick={() => { setMode("forgot"); setError(null); }}>
        Forgot your password?
      </Button>
    </CenteredPanel>
  );
}
