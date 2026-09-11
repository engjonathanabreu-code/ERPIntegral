-- Reorder only existing steps, atomically, with the same management permissions.
create function public.reorder_plan_steps(p_plan_id uuid, p_step_ids uuid[], p_expected_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_ids uuid[];
begin
  if auth.uid() is null or not coalesce(public.can_manage_core(), false) then
    raise exception 'Sem permissao para reordenar etapas' using errcode = '42501';
  end if;

  perform 1 from public.planos_trabalho where id = p_plan_id for update;
  if not found then
    raise exception 'Plano indisponivel' using errcode = '42501';
  end if;
  perform 1 from public.etapas_plano where plano_id = p_plan_id order by id for update;
  select array_agg(id order by ordem, id) into current_ids
    from public.etapas_plano where plano_id = p_plan_id;

  if current_ids is distinct from p_expected_ids then
    raise exception 'As etapas foram alteradas. Reabra o plano e tente novamente.' using errcode = '40001';
  end if;
  if p_step_ids is null or cardinality(p_step_ids) <> coalesce(cardinality(current_ids), 0)
    or (select count(distinct id) from unnest(p_step_ids) as ids(id)) <> cardinality(p_step_ids)
    or not (p_step_ids <@ current_ids and current_ids <@ p_step_ids) then
    raise exception 'Lista de etapas invalida' using errcode = '22023';
  end if;

  update public.etapas_plano as step set ordem = (position.n - 1)::integer
    from unnest(p_step_ids) with ordinality as position(id, n)
    where step.id = position.id and step.plano_id = p_plan_id
      and step.ordem is distinct from (position.n - 1)::integer;
end;
$$;

revoke all on function public.reorder_plan_steps(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.reorder_plan_steps(uuid, uuid[], uuid[]) to authenticated;
