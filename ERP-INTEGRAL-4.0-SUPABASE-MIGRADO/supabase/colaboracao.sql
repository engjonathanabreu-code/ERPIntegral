-- Instalação aditiva: calendário, notificações e chat. Não modifica políticas legadas.
begin;
create schema if not exists erp_collab_private;
revoke all on schema erp_collab_private from public, anon;
grant usage on schema erp_collab_private to authenticated;

create function erp_collab_private.active_user() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and ativo=true);
$$;
create function erp_collab_private.manager() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and ativo=true and tipo in ('Administrador','Diretor de Projetos','Diretor de Projeto'));
$$;
create function erp_collab_private.directory() returns table(id uuid,nome text,tipo text) language sql stable security definer set search_path='' as $$
 select p.id,p.nome,p.tipo from public.profiles p where p.ativo=true and erp_collab_private.active_user();
$$;
create function public.erp_collab_directory() returns table(id uuid,nome text,tipo text) language sql stable security invoker set search_path='' as $$ select * from erp_collab_private.directory(); $$;

create table public.erp_agendas (
 id uuid primary key default gen_random_uuid(), nome text not null check(length(trim(nome)) between 1 and 120),
 created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create table public.erp_eventos (
 id uuid primary key default gen_random_uuid(), serie_id uuid not null, titulo text not null check(length(trim(titulo)) between 1 and 200),
 descricao text not null default '', inicio timestamptz not null, fim timestamptz not null check(fim>inicio),
 agenda_id uuid references public.erp_agendas(id), entidade_tipo text, entidade_id uuid,
 participantes uuid[] not null default '{}', publico boolean not null default false,
 recorrencia text not null default 'nenhuma' check(recorrencia in ('nenhuma','diaria','semanal','mensal')),
 cor text not null default '#2563eb' check(cor ~ '^#[0-9a-fA-F]{6}$'),
 status text not null default 'ativo' check(status in ('ativo','concluido','cancelado')),
 created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(),
 check ((entidade_tipo is null and entidade_id is null) or (entidade_tipo is not null and entidade_tipo in ('projeto','plano','meta','processo') and entidade_id is not null))
);
create index erp_eventos_periodo on public.erp_eventos(inicio,fim);
create index erp_eventos_serie on public.erp_eventos(serie_id);
create index erp_eventos_participantes on public.erp_eventos using gin(participantes);
create table public.erp_evento_respostas (
 evento_id uuid not null references public.erp_eventos(id), usuario_id uuid not null default auth.uid() references public.profiles(id),
 resposta text not null check(resposta in ('aceito','recusado')), primary key(evento_id,usuario_id)
);
create table public.erp_conversas (
 id uuid primary key default gen_random_uuid(), tipo text not null check(tipo in ('direto','grupo')), titulo text not null check(length(trim(titulo)) between 1 and 200),
 entidade_tipo text, entidade_id uuid, participantes uuid[] not null,
 created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(),
 excluido_em timestamptz,
 check ((tipo='direto' and cardinality(participantes)=2 and entidade_tipo is null and entidade_id is null) or
 (tipo='grupo' and cardinality(participantes)>0 and entidade_tipo is not null and entidade_tipo in ('projeto','plano','processo') and entidade_id is not null))
);
create index erp_conversas_participantes on public.erp_conversas using gin(participantes);
create table public.erp_mensagens (
 id uuid primary key default gen_random_uuid(), conversa_id uuid not null references public.erp_conversas(id),
 autor_id uuid not null default auth.uid() references public.profiles(id), texto text not null default '' check(length(texto)<=10000),
 arquivo_path text, arquivo_nome text, evento_id uuid references public.erp_eventos(id), created_at timestamptz not null default now(),
 check(length(trim(texto))>0 or arquivo_path is not null or evento_id is not null)
);
create index erp_mensagens_conversa on public.erp_mensagens(conversa_id,created_at,id);
create table public.erp_exclusoes_chat (
 id uuid primary key default gen_random_uuid(), conversa_id uuid not null references public.erp_conversas(id),
 solicitado_por uuid not null default auth.uid() references public.profiles(id), motivo text not null check(length(trim(motivo)) between 1 and 1000),
 status text not null default 'pendente' check(status in ('pendente','aprovado','rejeitado')),
 decidido_por uuid references public.profiles(id), decidido_em timestamptz, created_at timestamptz not null default now()
);
create unique index erp_exclusoes_pendente on public.erp_exclusoes_chat(conversa_id) where status='pendente';
create table public.erp_colaboracao_historico (
 id bigint generated always as identity primary key, entidade_tipo text not null, entidade_id uuid not null,
 evento_id uuid references public.erp_eventos(id), conversa_id uuid references public.erp_conversas(id),
 autor_id uuid references public.profiles(id), descricao text not null, created_at timestamptz not null default now()
);
create index erp_colaboracao_historico_entidade on public.erp_colaboracao_historico(entidade_tipo,entidade_id,created_at);
create table public.erp_notificacoes_lidas (
 usuario_id uuid not null default auth.uid() references public.profiles(id), chave text not null, created_at timestamptz not null default now(), primary key(usuario_id,chave)
);
create table public.erp_agenda_pessoal (
 usuario_id uuid not null default auth.uid() references public.profiles(id), chave text not null, created_at timestamptz not null default now(), primary key(usuario_id,chave)
);
create table public.erp_calendario_ocultos (
 usuario_id uuid not null default auth.uid() references public.profiles(id), chave text not null check(char_length(chave) between 1 and 300), created_at timestamptz not null default now(), primary key(usuario_id,chave)
);
create table public.erp_cores_prazos (
 chave text primary key, cor text not null check(cor ~ '^#[0-9a-fA-F]{6}$')
);

-- Consulta invoker: conserva as regras de leitura existentes para cada card.
create function erp_collab_private.entity_visible(t text,i uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select erp_collab_private.active_user() and case t
 when 'projeto' then exists(select 1 from public.projetos where id=i)
 when 'plano' then exists(select 1 from public.planos_trabalho where id=i)
 when 'meta' then exists(select 1 from public.metas where id=i)
 when 'processo' then exists(select 1 from public.processos_kanban where id=i and not excluido_erp)
 else false end;
$$;
create function erp_collab_private.chat_member(i uuid) returns boolean language sql stable security definer set search_path='' as $$
 select erp_collab_private.active_user() and exists(select 1 from public.erp_conversas where id=i and auth.uid()=any(participantes) and excluido_em is null);
$$;
create function erp_collab_private.event_visible(i uuid) returns boolean language sql stable security definer set search_path='' as $$
 select erp_collab_private.active_user() and exists(select 1 from public.erp_eventos where id=i and (publico or created_by=auth.uid() or auth.uid()=any(participantes) or public.is_admin()));
$$;

do $$ declare t text; begin
 foreach t in array array['erp_agendas','erp_eventos','erp_evento_respostas','erp_conversas','erp_mensagens','erp_exclusoes_chat','erp_colaboracao_historico','erp_notificacoes_lidas','erp_agenda_pessoal','erp_calendario_ocultos','erp_cores_prazos'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy agendas_read on public.erp_agendas for select to authenticated using(erp_collab_private.active_user());
create policy eventos_read on public.erp_eventos for select to authenticated using(erp_collab_private.event_visible(id));
create policy respostas_read on public.erp_evento_respostas for select to authenticated using(erp_collab_private.event_visible(evento_id));
create policy conversas_read on public.erp_conversas for select to authenticated using(erp_collab_private.chat_member(id));
create policy mensagens_read on public.erp_mensagens for select to authenticated using(erp_collab_private.chat_member(conversa_id));
create policy exclusoes_read on public.erp_exclusoes_chat for select to authenticated using(erp_collab_private.active_user() and (solicitado_por=auth.uid() or public.is_admin()));
create policy historico_read on public.erp_colaboracao_historico for select to authenticated using(
 erp_collab_private.entity_visible(entidade_tipo,entidade_id) and
 ((evento_id is not null and erp_collab_private.event_visible(evento_id)) or
 (conversa_id is not null and (erp_collab_private.chat_member(conversa_id) or public.is_admin()))));
create policy lidas_read on public.erp_notificacoes_lidas for select to authenticated using(usuario_id=auth.uid() and erp_collab_private.active_user());
create policy pessoal_read on public.erp_agenda_pessoal for select to authenticated using(usuario_id=auth.uid() and erp_collab_private.active_user());
create policy ocultos_proprio on public.erp_calendario_ocultos for all to authenticated using(usuario_id=auth.uid() and erp_collab_private.active_user()) with check(usuario_id=auth.uid() and erp_collab_private.active_user());
grant select,insert,delete on public.erp_calendario_ocultos to authenticated;
create policy cores_read on public.erp_cores_prazos for select to authenticated using(erp_collab_private.active_user());

-- Toda escrita passa por operações transacionais; clientes não podem falsificar autoria,
-- alterar participantes ou apagar mensagens diretamente pela API.
create function erp_collab_private.mutate(op text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); new_id uuid; serie uuid; members uuid[]; c public.erp_conversas; ev public.erp_eventos;
 req public.erp_exclusoes_chat; start_at timestamptz; end_at timestamptz; original_start timestamptz; original_end timestamptz;
 until_day date; repeat_rule text; n integer:=0; aid uuid; ids jsonb:='[]'; link_type text:=nullif(p->>'entidade_tipo',''); link_id uuid:=nullif(p->>'entidade_id','')::uuid;
begin
 if not erp_collab_private.active_user() then raise exception 'Usuário inativo ou sessão expirada'; end if;
 if op='agenda' then
   if not public.is_admin() then raise exception 'Somente a administração pode criar agendas de ativos'; end if;
   insert into public.erp_agendas(nome,created_by) values(p->>'nome',me) returning id into new_id;
 elsif op='evento' then
   select array_agg(distinct x) into members from (select jsonb_array_elements_text(coalesce(p->'participantes','[]'))::uuid x union select me) s;
   if exists(select 1 from unnest(members) x where not exists(select 1 from public.profiles where id=x and ativo)) then raise exception 'Participante inválido'; end if;
   original_start:=(p->>'inicio')::timestamptz; original_end:=(p->>'fim')::timestamptz;
   if original_start is null or original_end is null or original_end<=original_start then raise exception 'Informe um período válido'; end if;
   repeat_rule:=coalesce(p->>'recorrencia','nenhuma');
   if repeat_rule not in ('nenhuma','diaria','semanal','mensal') then raise exception 'Recorrência inválida'; end if;
   until_day:=coalesce(nullif(p->>'repetir_ate','')::date,(original_start at time zone 'America/Sao_Paulo')::date);
   if until_day<(original_start at time zone 'America/Sao_Paulo')::date or until_day>(original_start at time zone 'America/Sao_Paulo')::date+interval '2 years' then raise exception 'A recorrência deve terminar em até dois anos'; end if;
   aid:=nullif(p->>'agenda_id','')::uuid; serie:=gen_random_uuid();
   -- Serializa as reservas do mesmo ativo, inclusive entre usuários concorrentes.
   if aid is not null then perform 1 from public.erp_agendas where id=aid for update; if not found then raise exception 'Agenda não encontrada'; end if; end if;
   loop
     start_at:=((original_start at time zone 'America/Sao_Paulo')+case repeat_rule when 'diaria' then n*interval '1 day' when 'semanal' then n*interval '7 days' when 'mensal' then n*interval '1 month' else interval '0' end) at time zone 'America/Sao_Paulo';
     end_at:=start_at+(original_end-original_start);
     exit when (start_at at time zone 'America/Sao_Paulo')::date>until_day;
     if n>=366 then raise exception 'Limite de 366 ocorrências por série'; end if;
     if aid is not null and exists(select 1 from public.erp_eventos where agenda_id=aid and status='ativo' and inicio<end_at and fim>start_at) then raise exception 'O ativo já está reservado em uma das datas selecionadas'; end if;
     insert into public.erp_eventos(serie_id,titulo,descricao,inicio,fim,agenda_id,entidade_tipo,entidade_id,participantes,publico,recorrencia,created_by,cor)
       values(serie,p->>'titulo',coalesce(p->>'descricao',''),start_at,end_at,aid,link_type,link_id,members,aid is not null or coalesce((p->>'publico')::boolean,false),repeat_rule,me,'#'||substr(md5(serie::text),1,6)) returning id into new_id;
     ids:=ids||to_jsonb(new_id);
     if link_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,evento_id,autor_id,descricao) values(link_type,link_id,new_id,me,'Evento criado: '||(p->>'titulo')); end if;
     n:=n+1; exit when repeat_rule='nenhuma';
   end loop;
   return jsonb_build_object('id',ids->>0,'ids',ids,'serie_id',serie);
 elsif op in ('evento_status','evento_cor','resposta') then
   select * into ev from public.erp_eventos where id=(p->>'id')::uuid for update;
   if not found or not erp_collab_private.event_visible(ev.id) then raise exception 'Evento indisponível'; end if;
   new_id:=ev.id;
   if op='resposta' then
     if not me=any(ev.participantes) then raise exception 'Você não foi convidado'; end if;
     insert into public.erp_evento_respostas values(ev.id,me,p->>'resposta') on conflict(evento_id,usuario_id) do update set resposta=excluded.resposta;
   else
     if op='evento_cor' and not public.is_admin() then raise exception 'Somente a administração pode alterar cores'; end if;
     if op='evento_status' and ev.created_by<>me and not public.is_admin() then raise exception 'Somente o criador ou a administração pode alterar o evento'; end if;
     if op='evento_status' and (p->>'status' is null or p->>'status' not in ('concluido','cancelado')) then raise exception 'Só é possível concluir ou cancelar um evento'; end if;
     update public.erp_eventos set cor=case when op='evento_cor' then p->>'cor' else cor end,status=case when op='evento_status' then p->>'status' else status end
       where id=ev.id or (coalesce((p->>'serie')::boolean,false) and serie_id=ev.serie_id);
     if ev.entidade_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,evento_id,autor_id,descricao) values(ev.entidade_tipo,ev.entidade_id,ev.id,me,case when op='evento_cor' then 'Cor do evento alterada' else 'Evento: '||(p->>'status') end); end if;
   end if;
 elsif op='conversa' then
   select array_agg(distinct x order by x) into members from (select jsonb_array_elements_text(coalesce(p->'participantes','[]'))::uuid x union select me) s;
   if exists(select 1 from unnest(members) x where not exists(select 1 from public.profiles where id=x and ativo)) then raise exception 'Participante inválido'; end if;
   if p->>'tipo'='grupo' and not erp_collab_private.manager() then raise exception 'Somente a administração ou o diretor de projetos pode criar grupos'; end if;
   if p->>'tipo'='direto' then
     if cardinality(members)<>2 then raise exception 'Selecione outro usuário'; end if;
     perform pg_advisory_xact_lock(hashtextextended(array_to_string(members,','),0));
     select id into new_id from public.erp_conversas where tipo='direto' and participantes=members and excluido_em is null limit 1;
     if found then return jsonb_build_object('id',new_id); end if;
   end if;
   insert into public.erp_conversas(tipo,titulo,entidade_tipo,entidade_id,participantes,created_by)
     values(p->>'tipo',left(coalesce(nullif(p->>'titulo',''),'Conversa direta'),200),link_type,link_id,members,me) returning id into new_id;
   if link_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,conversa_id,autor_id,descricao) values(link_type,link_id,new_id,me,'Grupo de trabalho criado: '||(p->>'titulo')); end if;
 elsif op in ('mensagem','exclusao') then
   select * into c from public.erp_conversas where id=(p->>'conversa_id')::uuid for update;
   if not found or not erp_collab_private.chat_member(c.id) then raise exception 'Conversa indisponível'; end if;
   if op='mensagem' then
     if nullif(p->>'evento_id','') is not null then
       select * into ev from public.erp_eventos where id=(p->>'evento_id')::uuid;
       if not found or not erp_collab_private.event_visible(ev.id) or not (ev.publico or c.participantes<@ev.participantes) then raise exception 'O evento deve incluir todos os participantes da conversa'; end if;
     end if;
     if nullif(p->>'arquivo_path','') is not null and not exists(select 1 from storage.objects where bucket_id='erp-chat' and name=p->>'arquivo_path' and (storage.foldername(name))[1]=c.id::text and (storage.foldername(name))[2]=me::text) then raise exception 'Arquivo não encontrado nesta conversa'; end if;
     insert into public.erp_mensagens(conversa_id,autor_id,texto,arquivo_path,arquivo_nome,evento_id) values(c.id,me,coalesce(p->>'texto',''),nullif(p->>'arquivo_path',''),left(p->>'arquivo_nome',255),nullif(p->>'evento_id','')::uuid) returning id into new_id;
     if c.entidade_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,conversa_id,autor_id,descricao) values(c.entidade_tipo,c.entidade_id,c.id,me,'Mensagem no grupo: '||c.titulo); end if;
   else
     insert into public.erp_exclusoes_chat(conversa_id,solicitado_por,motivo) values(c.id,me,p->>'motivo') returning id into new_id;
   end if;
 elsif op='decidir_exclusao' then
   if not public.is_admin() then raise exception 'Somente a administração pode decidir exclusões'; end if;
   select * into req from public.erp_exclusoes_chat where id=(p->>'id')::uuid for update;
   if not found or req.status<>'pendente' then raise exception 'Solicitação já decidida ou inexistente'; end if;
   if p->>'status' not in ('aprovado','rejeitado') then raise exception 'Decisão inválida'; end if;
   update public.erp_exclusoes_chat set status=p->>'status',decidido_por=me,decidido_em=now() where id=req.id;
   select * into c from public.erp_conversas where id=req.conversa_id for update;
   if p->>'status'='aprovado' then update public.erp_conversas set excluido_em=now() where id=c.id; end if;
   if c.entidade_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,conversa_id,autor_id,descricao) values(c.entidade_tipo,c.entidade_id,c.id,me,'Solicitação de exclusão: '||(p->>'status')); end if;
   new_id:=req.id;
 elsif op='lida' then
   insert into public.erp_notificacoes_lidas(usuario_id,chave) values(me,left(p->>'chave',300)) on conflict do nothing;
 elsif op='pessoal' then
   insert into public.erp_agenda_pessoal(usuario_id,chave) values(me,left(p->>'chave',300)) on conflict do nothing;
 elsif op='cor_prazo' then
   if not public.is_admin() then raise exception 'Somente a administração pode alterar cores'; end if;
   insert into public.erp_cores_prazos values(left(p->>'chave',300),p->>'cor') on conflict(chave) do update set cor=excluded.cor;
 else raise exception 'Operação desconhecida'; end if;
 return jsonb_build_object('id',new_id);
end $$;

-- Link validation runs as the caller BEFORE the privileged atomic operation.
create function public.erp_collab_action(op text,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if op='remover_pessoal' then
   delete from public.erp_agenda_pessoal where usuario_id=auth.uid() and chave=left(p->>'chave',300);
   return jsonb_build_object('id',null);
 end if;
 if op in ('evento','conversa') and nullif(p->>'entidade_tipo','') is not null and not erp_collab_private.entity_visible(p->>'entidade_tipo',(p->>'entidade_id')::uuid) then raise exception 'Você não tem acesso ao registro associado'; end if;
 return erp_collab_private.mutate(op,p);
end $$;

-- Prazos sempre consultados na origem: concluir/cancelar remove avisos imediatamente.
create view public.erp_prazos with (security_invoker=true) as
 select 'meta:'||m.id chave,'meta'::text entidade_tipo,m.id entidade_id,m.titulo,
 coalesce(m.semana_inicio,m.created_at::date) inicio,m.prazo fim,
 coalesce(array(select r.usuario_id from public.meta_responsaveis r where r.meta_id=m.id),'{}') participantes
 from public.metas m where m.prazo is not null and m.status not in ('Concluído','Concluída','Cancelado','Cancelada')
 union all
 select 'plano:'||p.id,'plano',p.id,p.titulo,least(p.created_at::date,max(s.prazo)),max(s.prazo),
 coalesce(array(select distinct r.usuario_id from public.etapa_responsaveis r join public.etapas_plano z on z.id=r.etapa_id where z.plano_id=p.id),'{}')
 from public.planos_trabalho p join public.etapas_plano s on s.plano_id=p.id
 where p.status not in ('Concluído','Cancelado') group by p.id having max(s.prazo) is not null
 union all
 select 'etapa:'||s.id,'plano',p.id,p.titulo||' — '||s.titulo,least(s.created_at::date,s.prazo),s.prazo,
 coalesce(array(select r.usuario_id from public.etapa_responsaveis r where r.etapa_id=s.id),'{}')
 from public.etapas_plano s join public.planos_trabalho p on p.id=s.plano_id
 where s.prazo is not null and s.status not in ('Concluída','Concluído','Cancelado') and p.status not in ('Concluído','Cancelado')
 union all
 select 'processo:'||p.id,'processo',p.id,p.nucleo,least(p.etapa_iniciada_em::date,p.prazo),p.prazo,array[p.responsavel_id]
 from public.processos_kanban p where p.prazo is not null and p.ativo and not p.excluido_erp and p.etapa_atual not in ('Concluído','Concluída','Finalizado','Cancelado')
;
revoke all on public.erp_prazos from anon;
grant select on public.erp_prazos to authenticated;

create function public.erp_collab_notifications() returns table(chave text,titulo text,tipo text,entidade_tipo text,entidade_id uuid,evento_id uuid,conversa_id uuid,prazo date,lida boolean) language sql stable security invoker set search_path='' as $$
 with d as (select (now() at time zone 'America/Sao_Paulo')::date dia), feed as (
 select 'vinculo:'||p.chave chave,'Você está vinculado: '||p.titulo titulo,'vinculo'::text tipo,p.entidade_tipo,p.entidade_id,null::uuid evento_id,null::uuid conversa_id,p.fim prazo
 from public.erp_prazos p where auth.uid()=any(p.participantes)
 union all
 select 'prazo:'||p.chave||':'||d.dia,case when p.fim<d.dia then 'Em atraso: ' else 'Prazo em '||(p.fim-d.dia)||' dia(s): ' end||p.titulo,'prazo',p.entidade_tipo,p.entidade_id,null::uuid,null::uuid,p.fim
 from public.erp_prazos p cross join d where auth.uid()=any(p.participantes) and p.entidade_tipo in ('meta','plano','processo') and (p.fim-d.dia in (3,1) or p.fim<d.dia)
 union all
 select 'projeto_prazo:'||p.id||':'||d.dia,case when p.prazo_final<d.dia then 'Projeto em atraso: ' else 'Projeto vence em '||(p.prazo_final-d.dia)||' dia(s): ' end||p.nome,'prazo','projeto',p.id,null::uuid,null::uuid,p.prazo_final
 from public.projetos p cross join d where p.created_by=auth.uid() and p.prazo_final is not null and p.status not in ('Concluído','Cancelado') and (p.prazo_final-d.dia in (3,1) or p.prazo_final<d.dia)
 union all
 select 'evento:'||e.id,'Convite: '||e.titulo,'evento',e.entidade_tipo,e.entidade_id,e.id,null::uuid,(e.fim at time zone 'America/Sao_Paulo')::date
 from public.erp_eventos e where auth.uid()=any(e.participantes) and e.created_by<>auth.uid() and e.status='ativo' and e.fim>=now()
 union all
 select 'grupo:'||c.id,'Você foi incluído no grupo: '||c.titulo,'grupo',c.entidade_tipo,c.entidade_id,null::uuid,c.id,null::date
 from public.erp_conversas c where c.tipo='grupo' and c.created_by<>auth.uid()
 union all
 select 'mensagem:'||m.id,'Mensagem: '||c.titulo,'mensagem',c.entidade_tipo,c.entidade_id,m.evento_id,c.id,null::date
 from public.erp_mensagens m join public.erp_conversas c on c.id=m.conversa_id where m.autor_id<>auth.uid() and m.created_at>now()-interval '30 days'
 union all
 select 'exclusao:'||r.id,'Solicitação de exclusão de chat','exclusao',null,null::uuid,null::uuid,r.conversa_id,null::date
 from public.erp_exclusoes_chat r where r.status='pendente' and public.is_admin()
 ) select f.*,exists(select 1 from public.erp_notificacoes_lidas l where l.usuario_id=auth.uid() and l.chave=f.chave) from feed f where erp_collab_private.active_user();
$$;

insert into storage.buckets(id,name,public,file_size_limit) values('erp-chat','erp-chat',false,20971520) on conflict(id) do nothing;
create policy erp_chat_upload on storage.objects for insert to authenticated with check(case when bucket_id='erp-chat' then (storage.foldername(name))[2]=auth.uid()::text and erp_collab_private.chat_member(((storage.foldername(name))[1])::uuid) else false end);
create policy erp_chat_download on storage.objects for select to authenticated using(case when bucket_id='erp-chat' then erp_collab_private.chat_member(((storage.foldername(name))[1])::uuid) else false end);

revoke all on all functions in schema erp_collab_private from public,anon,authenticated;
grant execute on function erp_collab_private.active_user(),erp_collab_private.manager(),erp_collab_private.directory(),erp_collab_private.entity_visible(text,uuid),erp_collab_private.chat_member(uuid),erp_collab_private.event_visible(uuid) to authenticated;
-- The private schema must NOT be added to the Data API exposed schemas.
-- The public invoker facade checks linked records under the caller's RLS.
grant execute on function erp_collab_private.mutate(text,jsonb) to authenticated;
revoke all on function public.erp_collab_directory(),public.erp_collab_action(text,jsonb),public.erp_collab_notifications() from public,anon;
grant execute on function public.erp_collab_directory(),public.erp_collab_action(text,jsonb),public.erp_collab_notifications() to authenticated;
commit;

