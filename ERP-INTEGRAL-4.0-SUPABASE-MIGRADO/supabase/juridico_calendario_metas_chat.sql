-- ERP Integral — permissões do perfil Jurídico
-- Jurídico passa a ter o mesmo nível gerencial de calendário necessário para
-- criar/editar eventos. O chat continua disponível a todo usuário ativo.

create or replace function erp_collab_private.manager()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null and exists(
    select 1
    from public.profiles
    where id = auth.uid()
      and ativo = true
      and tipo in (
        'Administrador',
        'Diretor de Projetos',
        'Diretor de Projeto',
        'Jurídico',
        'Juridico'
      )
  );
$$;
