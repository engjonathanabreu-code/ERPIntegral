-- Executar após o script de instalação em uma transação de teste; nada é persistido.
create temporary table collab_test_fixture(k text primary key,v uuid);
grant all on collab_test_fixture to authenticated;
insert into collab_test_fixture select 'admin',id from public.profiles where ativo and tipo='Administrador' limit 1;
insert into collab_test_fixture select 'user',id from public.profiles where ativo and tipo='Projetos' limit 1;
insert into collab_test_fixture select 'other',id from public.profiles where ativo and tipo='Topografia' limit 1;
insert into collab_test_fixture select 'director',id from public.profiles where ativo and tipo='Diretor de Projetos' limit 1;
select set_config('request.jwt.claim.sub',(select v::text from collab_test_fixture where k='admin'),true);
set local role authenticated;
do $$ declare a uuid; e uuid; r jsonb; begin
 if (select count(*) from public.erp_collab_directory())<3 then raise exception 'Directory failed'; end if;
 r:=public.erp_collab_action('agenda','{"nome":"TESTE TRANSACIONAL - Carro"}');a:=(r->>'id')::uuid;
 insert into collab_test_fixture values('agenda',a);
 r:=public.erp_collab_action('evento',jsonb_build_object('titulo','TESTE Reserva mensal','inicio','2028-01-31T09:00:00-03:00','fim','2028-01-31T10:00:00-03:00','agenda_id',a,'recorrencia','mensal','repetir_ate','2028-03-31'));
 e:=(r->>'id')::uuid;insert into collab_test_fixture values('event',e);
 if jsonb_array_length(r->'ids')<>3 then raise exception 'Recurrence count failed'; end if;
 if not exists(select 1 from public.erp_eventos where serie_id=(r->>'serie_id')::uuid and (inicio at time zone 'America/Sao_Paulo')::date='2028-02-29') then raise exception 'Month clamp failed'; end if;
 begin
 perform public.erp_collab_action('evento',jsonb_build_object('titulo','Overlap','inicio','2028-02-29T09:30:00-03:00','fim','2028-02-29T11:00:00-03:00','agenda_id',a));
 raise exception 'TEST FAIL overlap allowed';
 exception when others then if sqlerrm not like 'O ativo já está reservado%' then raise; end if;end;
 perform public.erp_collab_action('evento',jsonb_build_object('titulo','Adjacent','inicio','2028-01-31T10:00:00-03:00','fim','2028-01-31T11:00:00-03:00','agenda_id',a));
end $$;
select set_config('request.jwt.claim.sub',(select v::text from collab_test_fixture where k='user'),true);
do $$ declare r jsonb;c uuid; begin
 begin perform public.erp_collab_action('agenda','{"nome":"Unauthorized"}');raise exception 'TEST FAIL admin restriction';exception when others then if sqlerrm not like 'Somente a administração%' then raise;end if;end;
 begin perform public.erp_collab_action('evento_cor',jsonb_build_object('id',(select v from collab_test_fixture where k='event'),'cor','#ff0000'));raise exception 'TEST FAIL color restriction';exception when others then if sqlerrm not like 'Somente a administração%' then raise;end if;end;
 r:=public.erp_collab_action('conversa',jsonb_build_object('tipo','direto','participantes',jsonb_build_array((select v from collab_test_fixture where k='admin'))));c:=(r->>'id')::uuid;
 insert into collab_test_fixture values('chat',c);
 perform public.erp_collab_action('mensagem',jsonb_build_object('conversa_id',c,'texto','Olá 😊'));
 if (select count(*) from public.erp_mensagens where conversa_id=c)<>1 then raise exception 'Message failed';end if;
 begin delete from public.erp_mensagens where conversa_id=c;raise exception 'TEST FAIL direct deletion';exception when insufficient_privilege then null;end;
 begin perform public.erp_collab_action('mensagem',jsonb_build_object('conversa_id',c,'arquivo_path',c::text||'/fake/file'));raise exception 'TEST FAIL forged attachment';exception when others then if sqlerrm not like 'Arquivo não encontrado%' then raise;end if;end;
 r:=public.erp_collab_action('evento',jsonb_build_object('titulo','Private','inicio','2028-03-01T09:00:00-03:00','fim','2028-03-01T10:00:00-03:00'));insert into collab_test_fixture values('private_event',(r->>'id')::uuid);
 r:=public.erp_collab_action('exclusao',jsonb_build_object('conversa_id',c,'motivo','Teste'));insert into collab_test_fixture values('request',(r->>'id')::uuid);
 begin perform public.erp_collab_action('decidir_exclusao',jsonb_build_object('id',(r->>'id'),'status','aprovado'));raise exception 'TEST FAIL approval';exception when others then if sqlerrm not like 'Somente a administração%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',(select v::text from collab_test_fixture where k='other'),true);
do $$ begin
 if exists(select 1 from public.erp_conversas where id=(select v from collab_test_fixture where k='chat')) then raise exception 'TEST FAIL outsider chat read';end if;
 if exists(select 1 from public.erp_mensagens where conversa_id=(select v from collab_test_fixture where k='chat')) then raise exception 'TEST FAIL outsider message read';end if;
 if exists(select 1 from public.erp_eventos where id=(select v from collab_test_fixture where k='private_event')) then raise exception 'TEST FAIL private event read';end if;
 begin perform public.erp_collab_action('mensagem',jsonb_build_object('conversa_id',(select v from collab_test_fixture where k='chat'),'texto','Intrusion'));raise exception 'TEST FAIL outsider write';exception when others then if sqlerrm not like 'Conversa indisponível%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',(select v::text from collab_test_fixture where k='admin'),true);
do $$ begin
 perform public.erp_collab_action('decidir_exclusao',jsonb_build_object('id',(select v from collab_test_fixture where k='request'),'status','aprovado'));
 if exists(select 1 from public.erp_conversas where id=(select v from collab_test_fixture where k='chat')) then raise exception 'TEST FAIL excluded conversation visible';end if;
end $$;
reset role;
-- Testa avisos com metas descartáveis e responsáveis reais, sem modificar metas existentes.
insert into collab_test_fixture select 'process',id from public.processos_kanban where ativo and not excluido_erp limit 1;
select set_config('request.jwt.claim.sub',(select v::text from collab_test_fixture where k='user'),true);
set local role authenticated;
do $$ begin
 begin perform public.erp_collab_action('conversa',jsonb_build_object('tipo','grupo','titulo','Grupo proibido','entidade_tipo','processo','entidade_id',(select v from collab_test_fixture where k='process')));raise exception 'TEST FAIL group role';exception when others then if sqlerrm not like 'Somente a administração ou o diretor%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',(select v::text from collab_test_fixture where k='director'),true);
do $$ declare r jsonb;c uuid;e uuid; begin
 begin perform public.erp_collab_action('conversa','{"tipo":"grupo","titulo":"Sem vínculo"}');raise exception 'TEST FAIL missing group link';exception when check_violation then null;end;
 r:=public.erp_collab_action('conversa',jsonb_build_object('tipo','grupo','titulo','TESTE Grupo','entidade_tipo','processo','entidade_id',(select v from collab_test_fixture where k='process'),'participantes',jsonb_build_array((select v from collab_test_fixture where k='user'))));c:=(r->>'id')::uuid;
 perform public.erp_collab_action('mensagem',jsonb_build_object('conversa_id',c,'texto','Histórico do grupo'));
 if (select count(*) from public.erp_colaboracao_historico where conversa_id=c)<>2 then raise exception 'TEST FAIL group history';end if;
 r:=public.erp_collab_action('evento',jsonb_build_object('titulo','TESTE Evento vinculado','inicio','2028-04-01T09:00:00-03:00','fim','2028-04-01T10:00:00-03:00','entidade_tipo','processo','entidade_id',(select v from collab_test_fixture where k='process'),'participantes',jsonb_build_array((select v from collab_test_fixture where k='user'))));e:=(r->>'id')::uuid;
 perform public.erp_collab_action('mensagem',jsonb_build_object('conversa_id',c,'texto','Convite','evento_id',e));
 if not exists(select 1 from public.erp_colaboracao_historico where evento_id=e) then raise exception 'TEST FAIL event history';end if;
 perform public.erp_collab_action('evento_status',jsonb_build_object('id',e,'status','cancelado'));
 begin perform public.erp_collab_action('evento_status',jsonb_build_object('id',e,'status','ativo'));raise exception 'TEST FAIL reservation reactivation bypass';exception when others then if sqlerrm not like 'Só é possível concluir%' then raise;end if;end;
end $$;
reset role;
insert into public.metas(id,titulo,semana_inicio,prazo,status,created_by)
 select gen_random_uuid(),'TESTE AVISO '||d,(now() at time zone 'America/Sao_Paulo')::date,(now() at time zone 'America/Sao_Paulo')::date+d,'Em andamento',(select v from collab_test_fixture where k='admin') from unnest(array[3,1,-1,2]) d;
insert into collab_test_fixture select 'meta'||(prazo-(now() at time zone 'America/Sao_Paulo')::date),id from public.metas where titulo like 'TESTE AVISO %';
insert into public.meta_responsaveis(meta_id,usuario_id) select v,(select v from collab_test_fixture where k='user') from collab_test_fixture where k like 'meta%';
select set_config('request.jwt.claim.sub',(select v::text from collab_test_fixture where k='user'),true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.erp_collab_notifications() where tipo='prazo' and entidade_id in(select v from collab_test_fixture where k like 'meta%'))<>3 then raise exception 'TEST FAIL deadline cadence';end if;
 perform public.erp_collab_action('lida',jsonb_build_object('chave',(select chave from public.erp_collab_notifications() where tipo='prazo' and entidade_id=(select v from collab_test_fixture where k='meta3'))));
 if not exists(select 1 from public.erp_collab_notifications() where tipo='prazo' and entidade_id=(select v from collab_test_fixture where k='meta3') and lida) then raise exception 'TEST FAIL read marker';end if;
end $$;
reset role;
update public.metas set status='Concluído' where id in(select v from collab_test_fixture where k like 'meta%');
set local role authenticated;
do $$ begin
 if exists(select 1 from public.erp_collab_notifications() where entidade_id in(select v from collab_test_fixture where k like 'meta%')) then raise exception 'TEST FAIL completed notifications';end if;
end $$;
reset role;
insert into public.planos_trabalho(id,titulo,status,created_by) values(gen_random_uuid(),'TESTE PLANO AVISO','Em andamento',(select v from collab_test_fixture where k='admin')) returning id;
insert into collab_test_fixture select 'plan',id from public.planos_trabalho where titulo='TESTE PLANO AVISO';
insert into public.etapas_plano(id,plano_id,titulo,prazo,status) values(gen_random_uuid(),(select v from collab_test_fixture where k='plan'),'TESTE ETAPA AVISO',(now() at time zone 'America/Sao_Paulo')::date+3,'Pendente');
insert into public.etapa_responsaveis(etapa_id,usuario_id) select id,(select v from collab_test_fixture where k='user') from public.etapas_plano where plano_id=(select v from collab_test_fixture where k='plan');
select set_config('request.jwt.claim.sub',(select v::text from collab_test_fixture where k='user'),true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.erp_collab_notifications() where tipo='prazo' and entidade_tipo='plano' and entidade_id=(select v from collab_test_fixture where k='plan')) then raise exception 'TEST FAIL plan reminder';end if;
end $$;
reset role;
update public.planos_trabalho set status='Concluído' where id=(select v from collab_test_fixture where k='plan');
set local role authenticated;
do $$ begin
 if exists(select 1 from public.erp_collab_notifications() where entidade_id=(select v from collab_test_fixture where k='plan')) then raise exception 'TEST FAIL completed plan reminder';end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.erp_conversas;raise exception 'TEST FAIL anonymous';exception when insufficient_privilege then null;end;
 begin perform public.erp_collab_action('agenda','{}');raise exception 'TEST FAIL anonymous RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;

