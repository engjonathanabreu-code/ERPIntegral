-- ERP Integral - Administrador com acesso total ao sistema
-- Este script deve ser executado no SQL Editor do MESMO Supabase usado pelo ERP.
-- Ele NÃO transforma usuários comuns em administradores.
-- A regra de administrador é a mesma usada pelo frontend: public.profiles.tipo = 'Administrador'.

begin;

-- Função central, SECURITY DEFINER, para evitar recursão de RLS ao consultar profiles.
create or replace function public.erp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.ativo is not false
      and lower(trim(coalesce(p.tipo, ''))) = lower('Administrador')
  );
$$;

revoke all on function public.erp_is_admin() from public;
grant execute on function public.erp_is_admin() to authenticated;

-- Tabelas efetivamente utilizadas pelo ERP Integral.
-- O GRANT resolve erros PostgreSQL do tipo "permission denied for table ...".
-- O RLS continua ativo e a policy abaixo libera TODAS as operações somente ao Administrador.
do $$
declare
  t text;
  tables_to_secure text[] := array[
    'profiles',
    'clientes',
    'projetos',
    'etapas_projeto',
    'pagamentos',
    'planos_trabalho',
    'etapas_plano',
    'etapa_responsaveis',
    'entregaveis',
    'documentos',
    'comentarios_plano',
    'meta_setores',
    'ordens_servico',
    'ordem_servico_comentarios',
    'metas',
    'meta_responsaveis',
    'meta_historico',
    'meta_arquivos',
    'meta_checklist',
    'meta_comentarios'
  ];
begin
  foreach t in array tables_to_secure loop
    if to_regclass(format('public.%I', t)) is not null then
      -- Privilégio de tabela necessário antes de o RLS ser avaliado.
      execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

      -- Garante que o controle por políticas esteja ligado.
      execute format('alter table public.%I enable row level security', t);

      -- Policy permissiva adicional: Administrador pode fazer tudo.
      execute format('drop policy if exists %I on public.%I', 'erp_admin_full_access', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin())',
        'erp_admin_full_access', t
      );
    end if;
  end loop;
end
$$;

-- Se houver sequences/identities no schema public, permite que as operações autorizadas
-- pelas policies funcionem sem erro de sequence permission denied.
do $$
declare
  s record;
begin
  for s in
    select sequence_schema, sequence_name
    from information_schema.sequences
    where sequence_schema = 'public'
  loop
    execute format('grant usage, select on sequence %I.%I to authenticated', s.sequence_schema, s.sequence_name);
  end loop;
end
$$;

-- Storage usado pelo ERP para documentos e anexos de metas.
-- As policies existentes dos demais usuários permanecem; estas são adicionais para admin.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'documentos') then
    drop policy if exists "erp_admin_documentos_storage_select" on storage.objects;
    create policy "erp_admin_documentos_storage_select"
      on storage.objects for select to authenticated
      using (bucket_id = 'documentos' and public.erp_is_admin());

    drop policy if exists "erp_admin_documentos_storage_insert" on storage.objects;
    create policy "erp_admin_documentos_storage_insert"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'documentos' and public.erp_is_admin());

    drop policy if exists "erp_admin_documentos_storage_update" on storage.objects;
    create policy "erp_admin_documentos_storage_update"
      on storage.objects for update to authenticated
      using (bucket_id = 'documentos' and public.erp_is_admin())
      with check (bucket_id = 'documentos' and public.erp_is_admin());

    drop policy if exists "erp_admin_documentos_storage_delete" on storage.objects;
    create policy "erp_admin_documentos_storage_delete"
      on storage.objects for delete to authenticated
      using (bucket_id = 'documentos' and public.erp_is_admin());
  end if;
end
$$;

commit;

-- Diagnóstico opcional para rodar logo após o script:
-- select auth.uid(), public.erp_is_admin();
--
-- Para conferir as policies administrativas criadas:
-- select schemaname, tablename, policyname, cmd
-- from pg_policies
-- where policyname = 'erp_admin_full_access'
-- order by tablename;
