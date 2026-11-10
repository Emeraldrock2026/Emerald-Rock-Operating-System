-- PO documents and configurable readiness requirements. Isolated fixtures only; the final
-- RESULT exception rolls everything back, so no real client or project data changes.
do $$
declare
 t uuid:='00000000-0000-0000-0000-00000000ad02';
 u uuid:='10000000-0000-0000-0000-00000000ad02';
 r uuid:='10000000-0000-0000-0000-00000000ad03';
 v uuid:='10000000-0000-0000-0000-00000000ad04';
 e uuid:='20000000-0000-0000-0000-00000000ad02';
 c uuid:='30000000-0000-0000-0000-00000000ad02';
 p uuid:='40000000-0000-0000-0000-00000000ad02';
 p2 uuid:='40000000-0000-0000-0000-00000000ad03';
 a uuid:='60000000-0000-0000-0000-00000000ad02';
 f uuid:='70000000-0000-0000-0000-00000000ad02';
 f2 uuid:='70000000-0000-0000-0000-00000000ad03';
 n int;passes int:=0;fails text[]:='{}';
begin
 perform set_config('request.jwt.claims','',true);
 insert into tenants(id,business_name,display_name,project_prefix,is_demo) values(t,'PO readiness SQL acceptance','PO SQL','POQ',true);
 update tenant_modules set enabled=true where tenant_id=t and module_id in('clients_projects','commercial','documents');
 insert into tenant_memberships(tenant_id,user_id,email,role,status,commercial_access) values(t,u,'owner@poq.test','owner_admin','active',true),(t,r,'rm@poq.test','resource_manager','active',false),(t,v,'viewer@poq.test','employee','active',false);
 insert into employees(id,tenant_id,full_name,user_id) values(e,t,'SQL viewer',v);
 insert into clients(id,tenant_id,name) values(c,t,'SQL Client');
 insert into projects(id,tenant_id,name,status,start_date,planned_finish_date) values(p,t,'SQL Project','active','2026-11-10','2027-06-01'),(p2,t,'Other Project','active','2026-11-10','2027-06-01');
 insert into project_team(tenant_id,project_id,employee_id,project_role) values(t,p,e,'viewer');
 insert into project_modules(tenant_id,project_id,module_id,enabled) values(t,p,'documents',true),(t,p2,'documents',true) on conflict (project_id,module_id) do update set enabled=true;
 insert into project_files(id,tenant_id,project_id,module_id,title) values(f,t,p,'documents','PO 4471'),(f2,t,p2,'documents','Other PO');
 insert into project_file_versions(tenant_id,file_id,version_no,storage_path,file_name,mime_type,size_bytes) values(t,f,1,'x/po1.pdf','po1.pdf','application/pdf',10),(t,f2,1,'x/po2.pdf','po2.pdf','application/pdf',10);
 perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 insert into project_appointments(id,tenant_id,project_id,contracting_client_id,invoicing_client_id,title) values(a,t,p,c,c,'Tender');
 insert into appointment_commercials(tenant_id,appointment_id,terms,po_file_id,po_file_version) values(t,a,'{"po_required":"yes","po_status":"yes","po_number":"4471"}',f,1);
 select count(*) into n from appointment_commercials where appointment_id=a and po_file_id=f and po_file_version=1;if n=1 then passes:=passes+1;else fails:=fails||'owner attaches exact PO version';end if;
 begin update appointment_commercials set po_file_id=f2,po_file_version=1 where appointment_id=a;fails:=fails||'other project PO accepted';exception when others then passes:=passes+1;end;
 begin update appointment_commercials set po_file_version=9 where appointment_id=a;fails:=fails||'missing PO version accepted';exception when others then passes:=passes+1;end;
 begin update appointment_commercials set po_file_version=null where appointment_id=a;fails:=fails||'half PO link accepted';exception when others then passes:=passes+1;end;
 insert into tenant_readiness_settings(tenant_id,config) values(t,'{"commence_po_document":true,"invoice_recipients":false}');
 select count(*) into n from tenant_readiness_settings where tenant_id=t and (config->>'commence_po_document')::boolean;if n=1 then passes:=passes+1;else fails:=fails||'owner saves requirements';end if;
 begin update tenant_readiness_settings set config='{"surprise":true}' where tenant_id=t;fails:=fails||'unknown requirement accepted';exception when others then passes:=passes+1;end;
 begin update tenant_readiness_settings set config='{"commence_po":"no"}' where tenant_id=t;fails:=fails||'non-boolean requirement accepted';exception when others then passes:=passes+1;end;
 execute 'reset role';
 select count(*) into n from audit_log where tenant_id=t and record_table='tenant_readiness_settings';if n>=1 then passes:=passes+1;else fails:=fails||'requirements audited';end if;
 select count(*) into n from audit_log where tenant_id=t and record_table='appointment_commercials' and category='commercial';if n>=1 then passes:=passes+1;else fails:=fails||'PO link audited';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',r,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select count(*) into n from appointment_commercials where appointment_id=a;if n=0 then passes:=passes+1;else fails:=fails||'RM without commercial sees PO';end if;
 select count(*) into n from tenant_readiness_settings where tenant_id=t;if n=1 then passes:=passes+1;else fails:=fails||'RM reads requirements';end if;
 update tenant_readiness_settings set config='{}' where tenant_id=t;get diagnostics n=row_count;if n=0 then passes:=passes+1;else fails:=fails||'RM changed requirements';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',json_build_object('sub',v,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 select count(*) into n from appointment_commercials where appointment_id=a;if n=0 then passes:=passes+1;else fails:=fails||'viewer sees PO';end if;
 begin update appointment_commercials set po_file_id=null,po_file_version=null where appointment_id=a;get diagnostics n=row_count;if n=0 then passes:=passes+1;else fails:=fails||'viewer removed PO';end if;exception when others then passes:=passes+1;end;
 execute 'reset role';
 perform set_config('request.jwt.claims','',true);
 raise exception 'RESULT passes=% fails=%',passes,fails;
end $$;
