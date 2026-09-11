-- Optional presentation metadata only. Existing rows and access policies are unchanged.
set lock_timeout = '5s';
alter table public.projetos add column if not exists icone text check (icone is null or icone ~ '^(none|reurb:[a-z][a-z0-9-]{0,48}|ui:[a-z][a-z0-9-]{0,48})$');
alter table public.etapas_projeto add column if not exists icone text check (icone is null or icone ~ '^(none|reurb:[a-z][a-z0-9-]{0,48}|ui:[a-z][a-z0-9-]{0,48})$');
alter table public.planos_trabalho add column if not exists icone text check (icone is null or icone ~ '^(none|reurb:[a-z][a-z0-9-]{0,48}|ui:[a-z][a-z0-9-]{0,48})$');
alter table public.etapas_plano add column if not exists icone text check (icone is null or icone ~ '^(none|reurb:[a-z][a-z0-9-]{0,48}|ui:[a-z][a-z0-9-]{0,48})$');
alter table public.metas add column if not exists icone text check (icone is null or icone ~ '^(none|reurb:[a-z][a-z0-9-]{0,48}|ui:[a-z][a-z0-9-]{0,48})$');

