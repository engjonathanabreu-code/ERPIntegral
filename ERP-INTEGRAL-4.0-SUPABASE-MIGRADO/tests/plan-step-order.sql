-- Integration verification. Every order change is rolled back, including timestamps.
begin;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where tipo = 'Administrador' and ativo = true limit 1), true);
set local role authenticated;
do $$
declare
  plan_id uuid;
  original_ids uuid[];
  reversed_ids uuid[];
  actual_ids uuid[];
  before_fields jsonb;
  after_fields jsonb;
begin
  select plano_id into plan_id from public.etapas_plano group by plano_id having count(*) > 1 order by count(*) limit 1;
  assert plan_id is not null, 'A plan with multiple steps is required';
  select array_agg(id order by ordem, id), array_agg(id order by ordem desc, id desc) into original_ids, reversed_ids from public.etapas_plano where plano_id = plan_id;
  select jsonb_agg(to_jsonb(s) - array['ordem','updated_at'] order by s.id) into before_fields from public.etapas_plano s;
  perform public.reorder_plan_steps(plan_id, reversed_ids, original_ids);
  select array_agg(id order by ordem, id) into actual_ids from public.etapas_plano where plano_id = plan_id;
  assert actual_ids = reversed_ids, 'Reorder down failed';
  select jsonb_agg(to_jsonb(s) - array['ordem','updated_at'] order by s.id) into after_fields from public.etapas_plano s;
  assert before_fields = after_fields, 'Unrelated stage fields changed';
  begin
    perform public.reorder_plan_steps(plan_id, original_ids, original_ids);
    raise exception 'Stale order accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.reorder_plan_steps(plan_id, array[reversed_ids[1],reversed_ids[1]], reversed_ids);
    raise exception 'Invalid order accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.reorder_plan_steps(plan_id, original_ids, reversed_ids);
  select array_agg(id order by ordem, id) into actual_ids from public.etapas_plano where plano_id = plan_id;
  assert actual_ids = original_ids, 'Reorder up failed';
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.reorder_plan_steps(plan_id, reversed_ids, original_ids);
    raise exception 'Unauthenticated order accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
select 'PASS: reorder both ways, unchanged fields, stale/invalid/unauthenticated rejection; all changes rolled back' as result;
