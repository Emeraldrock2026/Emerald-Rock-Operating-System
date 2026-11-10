import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/app/status-badge";
import { profileObject } from "@/lib/domain/client-profile";
import { stageDatesValid, type ServiceStage } from "@/lib/domain/appointments";
import { appointmentConfirmed, invoicingRouteConfirmed, missingRequirements, poStatus, readyToCommence, readyToInvoice, readyToPrepareProposal, READINESS_LABEL, type AppointmentReadinessInput } from "@/lib/domain/readiness";

type AppointmentLike = {
  id: string;
  scope: string;
  execution_status: string;
  stages: unknown;
};

function tone(state: string): "ok" | "paused" | "off" {
  if (state === "approved" || state === "not_required") return "ok";
  if (state === "missing") return "off";
  return "paused";
}

export function ReadinessStrip({ tenantId, appointment, commercial }: { tenantId: string; appointment: AppointmentLike; commercial: boolean }) {
  const terms = useQuery({
    queryKey: ["tenant", tenantId, "appointment_commercials", appointment.id],
    enabled: commercial,
    queryFn: async () => {
      const { data, error } = await supabase.from("appointment_commercials").select("terms, commencement_exception").eq("tenant_id", tenantId).eq("appointment_id", appointment.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const stages: ServiceStage[] = Array.isArray(appointment.stages)
    ? appointment.stages.map((s) => { const p = profileObject(s); return { name: p["name"] ?? "", scope: p["scope"] ?? "", starts_on: p["starts_on"] ?? "", ends_on: p["ends_on"] ?? "" }; })
    : [];
  const input: AppointmentReadinessInput = {
    scope: appointment.scope,
    executionStatus: appointment.execution_status,
    stages,
    terms: profileObject(terms.data?.terms),
    commencementException: terms.data?.commencement_exception && typeof terms.data.commencement_exception === "object"
      ? terms.data.commencement_exception as AppointmentReadinessInput["commencementException"]
      : null,
  };
  const appt = appointmentConfirmed(appointment.execution_status);

  return (
    <section aria-label="Readiness" className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge tone={tone(appt)}>Appointment: {READINESS_LABEL[appt]}</StatusBadge>
        {commercial ? (
          <>
            <StatusBadge tone={tone(poStatus(input.terms))}>PO: {READINESS_LABEL[poStatus(input.terms)]}</StatusBadge>
            <StatusBadge tone={tone(invoicingRouteConfirmed(input.terms))}>Invoicing route: {READINESS_LABEL[invoicingRouteConfirmed(input.terms)]}</StatusBadge>
          </>
        ) : null}
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div><dt className="sr-only">Ready to prepare proposal</dt><dd>{readyToPrepareProposal(input) ? "✓" : "✗"} Ready to prepare proposal</dd></div>
        {commercial ? (
          <>
            <div><dt className="sr-only">Ready to commence</dt><dd>{readyToCommence(input) ? "✓" : "✗"} Ready to commence{input.commencementException && readyToCommence(input) && appt !== "approved" ? " (authorised exception)" : ""}</dd></div>
            <div><dt className="sr-only">Ready to invoice</dt><dd>{readyToInvoice(input) ? "✓" : "✗"} Ready to invoice</dd></div>
          </>
        ) : null}
      </dl>
      {commercial && stageDatesValid(stages) ? (
        missingRequirements(input).length ? (
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {missingRequirements(input).map((m) => <li key={m}>{m}</li>)}
          </ul>
        ) : null
      ) : null}
    </section>
  );
}
