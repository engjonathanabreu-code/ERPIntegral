-- ERP Integral - Checklist e comentários das metas
-- Executar uma vez no SQL Editor do Supabase do ERP.

create extension if not exists pgcrypto;

create table if not exists public.meta_checklist (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null references public.metas(id) on delete cascade,
  titulo text not null,
  concluido boolean not null default false,
  concluido_por uuid references auth.users(id) on delete set null,
  concluido_em timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_comentarios (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null references public.metas(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_meta_checklist_meta on public.meta_checklist(meta_id, created_at);
create index if not exists idx_meta_comentarios_meta on public.meta_comentarios(meta_id, created_at);

alter table public.meta_checklist enable row level security;
alter table public.meta_comentarios enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='meta_checklist' and policyname='meta_checklist_auth'
  ) then
    create policy meta_checklist_auth on public.meta_checklist
      for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='meta_comentarios' and policyname='meta_comentarios_auth'
  ) then
    create policy meta_comentarios_auth on public.meta_comentarios
      for all to authenticated using (true) with check (true);
  end if;
end
$$;
