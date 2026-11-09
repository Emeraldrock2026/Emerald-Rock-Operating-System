import { queryOptions } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brandFor, contrastRatio, readableTextOn } from "@/lib/domain/brand";

export const BRANDING_BUCKET = "tenant-branding";

/** CSS custom properties consumed by .brand-scope in styles.css. */
export function brandStyle(primary: string, accent: string): CSSProperties {
  const light = brandFor(primary, "light");
  const dark = brandFor(primary, "dark");
  const accentFg = readableTextOn(accent);
  // Highlight colour for the navigation: the brand colour if it shows on the accent, else the readable text colour.
  const onAccent = contrastRatio(primary, accent) >= 3 ? primary : contrastRatio(light, accent) >= 3 ? light : accentFg;
  return {
    "--brand-light": light,
    "--brand-light-fg": readableTextOn(light),
    "--brand-dark": dark,
    "--brand-dark-fg": readableTextOn(dark),
    "--brand-accent": accent,
    "--brand-accent-dark": `color-mix(in oklab, ${accent} 70%, black)`,
    "--brand-accent-fg": accentFg,
    "--brand-accent-fg-soft": `color-mix(in oklab, ${accentFg} 85%, ${accent})`,
    "--brand-on-accent": onAccent,
  } as CSSProperties;
}

/** True when the navigation background is dark, so the dark-background logo suits it. */
export const accentIsDark = (accent: string) => readableTextOn(accent) === "#FFFFFF";

/** Short-lived signed link to a private branding file, cached per business and path. */
export const logoUrlQuery = (tenantId: string, path: string | null) =>
  queryOptions({
    queryKey: ["tenant", tenantId, "logo", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BRANDING_BUCKET).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
