import { createFileRoute } from "@tanstack/react-router";
import { RequireModule } from "@/components/app/require-module";
import { ClientProfile } from "@/components/clients/client-profile";
export const Route=createFileRoute("/_authenticated/t/$tenantId/clients/$clientId")({
  head:()=>({meta:[{title:"Client profile — Emerald Rock OS"},{name:"description",content:"Client company identity, shared contacts and controlled profile changes."},{property:"og:title",content:"Client profile — Emerald Rock OS"},{property:"og:description",content:"Client company identity, shared contacts and controlled profile changes."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
  component:()=>{const {clientId}=Route.useParams();return <RequireModule module="clients_projects"><ClientProfile clientId={clientId}/></RequireModule>;},
});