-- ERP Integral - Metas semanais, Ordens de Serviço e histórico de metas
-- Executar no SQL Editor do Supabase do ERP.

create extension if not exists pgcrypto;

create table if not exists public.meta_setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.meta_setores (nome)
values ('Projetos'),('Topografia'),('Pós-protocolo'),('Atendimentos')
on conflict (nome) do nothing;

create table if not exists public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nucleo_referente text,
  etapa_atual text not null,
  municipio text not null,
  estado text not null,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ordem_servico_comentarios (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  texto text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  observacoes text,
  semana_inicio date not null,
  prazo date,
  status text not null default 'Planejamento',
  setor_id uuid references public.meta_setores(id) on delete set null,
  associacao_tipo text not null default 'avulsa' check (associacao_tipo in ('ordem_servico','projeto','plano','avulsa')),
  associacao_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_responsaveis (
  meta_id uuid not null references public.metas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  primary key (meta_id, usuario_id)
);

create table if not exists public.meta_historico (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid references public.metas(id) on delete set null,
  meta_titulo text,
  entidade_tipo text not null check (entidade_tipo in ('ordem_servico','projeto','plano','colaborador','avulsa')),
  entidade_id uuid,
  acao text not null,
  descricao text,
  autor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.meta_arquivos (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null references public.metas(id) on delete cascade,
  nome text not null,
  caminho_storage text not null,
  mime_type text,
  tamanho_bytes bigint,
  enviado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_metas_semana on public.metas(semana_inicio);
create index if not exists idx_metas_associacao on public.metas(associacao_tipo, associacao_id);
create index if not exists idx_meta_resp_usuario on public.meta_responsaveis(usuario_id);
create index if not exists idx_meta_hist_entidade on public.meta_historico(entidade_tipo, entidade_id, created_at desc);
create index if not exists idx_os_etapa on public.ordens_servico(etapa_atual);

alter table public.meta_setores enable row level security;
alter table public.ordens_servico enable row level security;
alter table public.ordem_servico_comentarios enable row level security;
alter table public.metas enable row level security;
alter table public.meta_responsaveis enable row level security;
alter table public.meta_historico enable row level security;
alter table public.meta_arquivos enable row level security;

-- O ERP já controla permissões de interface por perfil. As políticas abaixo
-- permitem aos usuários autenticados operar os registros conforme a UI.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meta_setores' and policyname='meta_setores_auth') then
    create policy meta_setores_auth on public.meta_setores for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ordens_servico' and policyname='ordens_servico_auth') then
    create policy ordens_servico_auth on public.ordens_servico for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ordem_servico_comentarios' and policyname='os_comentarios_auth') then
    create policy os_comentarios_auth on public.ordem_servico_comentarios for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='metas' and policyname='metas_auth') then
    create policy metas_auth on public.metas for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meta_responsaveis' and policyname='meta_resp_auth') then
    create policy meta_resp_auth on public.meta_responsaveis for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meta_historico' and policyname='meta_hist_auth') then
    create policy meta_hist_auth on public.meta_historico for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meta_arquivos' and policyname='meta_arq_auth') then
    create policy meta_arq_auth on public.meta_arquivos for all to authenticated using (true) with check (true);
  end if;
end $$;
