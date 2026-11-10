import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { readAllPages } from './read-all-pages';
export const appointmentsQuery=(tenantId:string, projectId?:string,clientId?:string)=>queryOptions({queryKey:['tenant',tenantId,'appointments',projectId??'all',clientId??'all'],queryFn:()=>readAllPages((from,to)=>{let q=supabase.from('project_appointments').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false}).order('id');if(projectId)q=q.eq('project_id',projectId);if(clientId)q=q.or(`contracting_client_id.eq.${clientId},invoicing_client_id.eq.${clientId}`);return q.range(from,to);})});
export type Appointment = Awaited<ReturnType<NonNullable<ReturnType<typeof appointmentsQuery>['queryFn']>>>[number];