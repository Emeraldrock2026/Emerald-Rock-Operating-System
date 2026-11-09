import { resolveAppearance, type Appearance } from "@/lib/domain/brand";
import { supabase } from "@/integrations/supabase/client";

/**
 * Light/dark mode. The saved personal choice lives in the database
 * (user_preferences); localStorage keeps a copy plus the active business's
 * default so the inline head script can set the right mode before first paint.
 */
export const PERSONAL_KEY = "ero:appearance";
export const BUSINESS_KEY = "ero:business-appearance";

const isAppearance = (v: unknown): v is Appearance => v === "light" || v === "dark" || v === "system";

/** Runs in <head> before the page paints. Keep in sync with resolveAppearance. */
export const NO_FLASH_SCRIPT = `(function(){try{var p=localStorage.getItem("${PERSONAL_KEY}"),b=localStorage.getItem("${BUSINESS_KEY}"),a=p||b||"system";var d=a==="dark"||(a==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

const listeners = new Set<() => void>();

function read(key: string): Appearance | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(key);
  return isAppearance(v) ? v : null;
}

export function applyAppearance() {
  if (typeof window === "undefined") return;
  const dark = resolveAppearance(read(PERSONAL_KEY), read(BUSINESS_KEY), window.matchMedia("(prefers-color-scheme: dark)").matches) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  listeners.forEach((l) => l());
}

export function setBusinessAppearance(a: Appearance | null) {
  if (a) window.localStorage.setItem(BUSINESS_KEY, a); else window.localStorage.removeItem(BUSINESS_KEY);
  applyAppearance();
}

function setPersonalLocal(a: Appearance | null) {
  if (a) window.localStorage.setItem(PERSONAL_KEY, a); else window.localStorage.removeItem(PERSONAL_KEY);
  applyAppearance();
}

export function getPersonalAppearance(): Appearance | null {
  return read(PERSONAL_KEY);
}

export function subscribeAppearance(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Load the signed-in user's saved choice. Call on sign-in and app start. */
export async function syncPersonalAppearance(userId: string) {
  const { data } = await supabase.from("user_preferences").select("appearance").eq("user_id", userId).maybeSingle();
  setPersonalLocal(isAppearance(data?.appearance) ? data.appearance : null);
}

/** Save the user's choice; null means "use the business default". */
export async function savePersonalAppearance(userId: string, a: Appearance | null) {
  const res = a
    ? await supabase.from("user_preferences").upsert({ user_id: userId, appearance: a, updated_at: new Date().toISOString() })
    : await supabase.from("user_preferences").delete().eq("user_id", userId);
  if (res.error) throw res.error;
  setPersonalLocal(a);
}

/** On sign-out, forget the previous person's choice on this device. */
export function clearPersonalAppearance() {
  setPersonalLocal(null);
}

/** Keep following the device setting while "System" is in effect. */
export function watchDeviceAppearance() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", applyAppearance);
  return () => mq.removeEventListener("change", applyAppearance);
}
