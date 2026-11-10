import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/read-all-pages";
export const clientDirectoryQuery = (tenantId: string) => queryOptions({
  queryKey: ["tenant", tenantId, "client-directory"],
  queryFn: () => readAllPages((from, to) => supabase.from("clients").select("id, name, contact_name, contact_email, active, version, profile, group_id, client_reference, display_reference, verified_at, verification_source").eq("tenant_id", tenantId).order("name").order("id").range(from, to)),
});
export const clientGroupsQuery = (tenantId: string) => queryOptions({queryKey:["tenant",tenantId,"client-groups"],queryFn:()=>readAllPages((from,to)=>supabase.from("client_groups").select("id,name").eq("tenant_id",tenantId).order("id").range(from,to))});
export const clientContactsQuery = (tenantId: string, clientId?: string) => queryOptions({queryKey:["tenant",tenantId,"client-contacts",clientId??"all"],queryFn:()=>readAllPages((from,to)=>{const q=supabase.from("client_contacts").select("*").eq("tenant_id",tenantId).order("id");return (clientId?q.eq("client_id",clientId):q).range(from,to);})});
export const clientFieldOptionsQuery = (tenantId: string) => queryOptions({queryKey:["tenant",tenantId,"client-field-options"],queryFn:()=>readAllPages((from,to)=>supabase.from("client_field_options").select("id,field,value,position,active,version").eq("tenant_id",tenantId).order("field").order("position").order("id").range(from,to))});
export type DirectoryClient = Awaited<ReturnType<NonNullable<ReturnType<typeof clientDirectoryQuery>["queryFn"]>>>[number];
export type ClientContact = Awaited<ReturnType<NonNullable<ReturnType<typeof clientContactsQuery>["queryFn"]>>>[number];