-- AI comparison + change register checks (stage P4). Run through the backend SQL tool; everything rolls back.
-- Needs Drawings and Change control on for Emerald Rock's first project.
-- Expected: amend_blank=refused, can_compare=true, change_findings=2, change_status=draft <ref>-CHA-000n, decision_kept=accepted,
--   findings_total=3, rm_compare=false, rm_review=refused, rm_sees_findings=0, run1=2/2, run2=2/1, run3_new=0, same_change=true, user_save_direct=refused
begin;
create temp table r(k text, v text) on commit drop;
create temp table ids(k text, v uuid) on commit drop;
grant all on r, ids to authenticated;
insert into ids select 'p', id from public.projects where tenant_id = '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7' order by reference limit 1;
insert into ids values ('f', gen_random_uuid());
create temp view pth as select '9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7/' || (select v from ids where k='p') || '/drawings/' || (select v from ids where k='f') as base;
grant select on pth to authenticated;
insert into storage.objects (bucket_id, name) select 'project-files', base || '/a-d.pdf' from pth;
insert into storage.objects (bucket_id, name) select 'project-files', base || '/b-d.pdf' from pth;
select set_config('request.jwt.claims', '{"sub":"7f62dbef-3d8c-428c-8f90-904bd01ea448","role":"authenticated"}', true);
set local role authenticated;
insert into public.project_records (tenant_id, project_id, module_id, title, fields) values ('9dc6a64c-5c2c-4b23-885c-a1fed0adc2a7', (select v from ids where k='p'), 'drawings', 'GA plan', '{"number":"TEST-A-100"}');
insert into ids select 'd', id from public.project_records where project_id = (select v from ids where k='p') and module_id='drawings' and fields->>'number'='TEST-A-100';
select public.record_project_file_version((select v from ids where k='f'), (select v from ids where k='p'), 'drawings', (select base from pth) || '/a-d.pdf', 'd.pdf', 'application/pdf', 10);
select public.record_project_file_version((select v from ids where k='f'), (select v from ids where k='p'), 'drawings', (select base from pth) || '/b-d.pdf', 'd.pdf', 'application/pdf', 10);
insert into ids select 'r1', public.add_drawing_revision((select v from ids where k='d'), 'P01', '2026-11-01', (select v from ids where k='f'), 1);
insert into ids select 'r2', public.add_drawing_revision((select v from ids where k='d'), 'P02', '2026-11-05', (select v from ids where k='f'), 2);
insert into r select 'can_compare', public.can_compare_drawing((select v from ids where k='d'), (select v from ids where k='r1'), (select v from ids where k='r2'))::text;
do $$ begin perform public.save_drawing_comparison(auth.uid(), (select v from ids where k='d'), (select v from ids where k='r1'), (select v from ids where k='r2'), 'completed', '', 'x', '[]');
  insert into r values ('user_save_direct','ALLOWED'); exception when others then insert into r values ('user_save_direct','refused'); end $$;
reset role;
insert into r select 'run1', (select finding_count||'/'||new_count from public.save_drawing_comparison('7f62dbef-3d8c-428c-8f90-904bd01ea448', (select v from ids where k='d'), (select v from ids where k='r1'), (select v from ids where k='r2'), 'completed', '', 'm',
  '[{"fingerprint":"a|l1|door","category":"added","location":"L1","summary":"New door"},{"fingerprint":"b|l2|wall","category":"moved","location":"L2","summary":"Wall moved"}]'));
insert into r select 'run2', (select finding_count||'/'||new_count from public.save_drawing_comparison('7f62dbef-3d8c-428c-8f90-904bd01ea448', (select v from ids where k='d'), (select v from ids where k='r1'), (select v from ids where k='r2'), 'completed', '', 'm',
  '[{"fingerprint":"a|l1|door","category":"added","location":"L1","summary":"New door"},{"fingerprint":"c|l3|note","category":"annotation","location":"L3","summary":"Note changed"}]'));
insert into r select 'findings_total', count(*)::text from public.comparison_findings where record_id = (select v from ids where k='d');
insert into ids select 'fa', id from public.comparison_findings where record_id = (select v from ids where k='d') and fingerprint='a|l1|door';
insert into ids select 'fb', id from public.comparison_findings where record_id = (select v from ids where k='d') and fingerprint='b|l2|wall';
insert into ids select 'fc', id from public.comparison_findings where record_id = (select v from ids where k='d') and fingerprint='c|l3|note';
set local role authenticated;
insert into ids select 'c1', public.review_comparison_finding((select v from ids where k='fa'), 'accepted');
insert into ids select 'c2', public.review_comparison_finding((select v from ids where k='fb'), 'amended', 'Wall moved 200mm east');
do $$ begin perform public.review_comparison_finding((select v from ids where k='fc'), 'amended', '');
  insert into r values ('amend_blank','ALLOWED'); exception when others then insert into r values ('amend_blank','refused'); end $$;
select public.review_comparison_finding((select v from ids where k='fc'), 'rejected');
insert into r select 'same_change', ((select v from ids where k='c1') = (select v from ids where k='c2'))::text;
insert into r select 'change_status', status || ' ' || reference from public.project_records where id = (select v from ids where k='c1');
insert into r select 'change_findings', count(*)::text from public.comparison_findings where change_record_id = (select v from ids where k='c1');
reset role;
insert into r select 'run3_new', (select new_count::text from public.save_drawing_comparison('7f62dbef-3d8c-428c-8f90-904bd01ea448', (select v from ids where k='d'), (select v from ids where k='r1'), (select v from ids where k='r2'), 'completed', '', 'm',
  '[{"fingerprint":"a|l1|door","category":"added","location":"L1","summary":"New door"}]'));
insert into r select 'decision_kept', decision from public.comparison_findings where id = (select v from ids where k='fa');
select set_config('request.jwt.claims', '{"sub":"a6a521aa-4a96-447a-9eaf-37a96823915f","role":"authenticated"}', true);
set local role authenticated;
insert into r select 'rm_compare', public.can_compare_drawing((select v from ids where k='d'), (select v from ids where k='r1'), (select v from ids where k='r2'))::text;
insert into r select 'rm_sees_findings', count(*)::text from public.comparison_findings;
do $$ begin perform public.review_comparison_finding((select v from ids where k='fc'), 'accepted');
  insert into r values ('rm_review','ALLOWED'); exception when others then insert into r values ('rm_review','refused'); end $$;
reset role;
select string_agg(k||'='||v, ' ; ' order by k) from r;
rollback;
