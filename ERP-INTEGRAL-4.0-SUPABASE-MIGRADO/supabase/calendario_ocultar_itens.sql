begin;
create table if not exists public.erp_calendario_ocultos (
  usuario_id uuid not null default auth.uid() references public.profiles(id),
  chave text not null check (char_length(chave) between 1 and 300),
  created_at timestamptz not null default now(),
  primary key (usuario_id,chave)
);
alter table public.erp_calendario_ocultos enable row level security;
revoke all on public.erp_calendario_ocultos from anon, authenticated;
grant select,insert,delete on public.erp_calendario_ocultos to authenticated;
create policy calendario_ocultos_proprio on public.erp_calendario_ocultos for all to authenticated using (usuario_id=auth.uid() and erp_collab_private.active_user()) with check (usuario_id=auth.uid() and erp_collab_private.active_user());
commit;

