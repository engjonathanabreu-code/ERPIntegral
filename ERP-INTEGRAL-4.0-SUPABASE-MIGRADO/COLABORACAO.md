# Calendário, notificações e chat

O módulo acrescenta uma aba Calendário antes de Planos de trabalho, o sino no cabeçalho e uma aba CHAT. Os módulos anteriores continuam carregados, com pontos de integração pequenos para abrir os registros e mostrar seus históricos.

## Funcionalidades

- Calendário quinzenal (1–15 e 16–fim do mês), mensal e trimestral, com uma linha por evento em cada dia de duração. Filtro de agenda pessoal e de ativo.
- Prazos consultados diretamente em metas, planos/etapas, projetos/etapas, processos e pagamentos do ERP. O prazo geral do plano é o maior prazo de suas etapas, preservando o formulário existente.
- Eventos avulsos ou associados a projeto, plano, meta ou processo. Convites com aceite/recusa, conclusão/cancelamento e histórico persistente nos cards. Cores automáticas, alteráveis pela administração.
- Recorrência diária, semanal ou mensal, com data final obrigatória: até 366 ocorrências e horizonte de dois anos. Mensalidades no dia 31 usam o último dia nos meses mais curtos. Horários de Brasília.
- Agendas de ativos criadas pela administração. A criação de uma série é transacional e bloqueia a agenda durante a verificação de conflitos. Se qualquer ocorrência conflitar, nenhuma é gravada.
- Sino com vínculos, convites, mensagens, inclusão em grupos e solicitações de exclusão. Avisos de prazo em D-3, D-1 e diariamente após atraso. Os avisos são calculados no banco com a data de Brasília e identificador diário, sem depender de agendamento no navegador. Concluir/cancelar o registro remove seus avisos na próxima consulta. Leituras e agenda pessoal são persistidas por usuário.
- Chat direto entre usuários ativos, arquivos privados de até 20 MB, emojis e convites ligados ao calendário. Grupos exclusivos para os participantes, criados por administrador ou diretor de projetos e obrigatoriamente associados a projeto, plano ou processo.
- Exclusão por solicitação e decisão da administração. A exclusão aprovada retira a conversa do acesso normal e mantém registros de auditoria, mensagens e arquivos protegidos para rastreabilidade. Não há exclusão direta pelo cliente.
- Atualização de sino e mensagens a cada 10 segundos enquanto a página está visível. O compositor não é refeito durante a atualização.

## Instalação e publicação

A migração `erp_calendario_notificacoes_chat` já foi aplicada no projeto ERP em 05/09/2026. Nesse projeto, não repetir o passo 1; publicar a interface a partir desta alteração. As tabelas novas foram verificadas vazias após os testes revertidos.

1. Aplicar uma única vez `supabase/colaboracao.sql` no projeto do ERP, `ycdsyilyvaxslkwbkxyo`, como migração. O script é transacional e aditivo. Não altera políticas ou dados das tabelas legadas.
2. Manter `erp_collab_private` fora dos schemas expostos pela Data API. As funções públicas são invoker; operações atômicas ficam no schema privado, com validação de usuário ativo e função/permissões.
3. Publicar os arquivos do repositório pelo processo já existente. O módulo utiliza a conexão Supabase já configurada, sem nova chave secreta no navegador.
4. Fazer uma conferência com duas contas reais após a publicação: convite, recebimento de mensagem e download de anexo. Os testes de navegador deste PR usam dados simulados; os testes SQL exercitam as regras reais em transações revertidas.

Para reverter a interface, remover as referências a `erp-collab.css`, `erp-collab-core.js` e `erp-collab.js` de `public/index.html`. Não apagar tabelas para reverter a interface: isso preserva o histórico já criado.

## Verificação

- `node build.js`: valida os arquivos esperados e a sintaxe de todos os módulos JavaScript.
- `node --test tests/collab-core.test.cjs`: períodos, ano bissexto, virada de ano e limites de duração.
- `node tests/collab-browser.cjs`: requer Playwright e Microsoft Edge. Carrega a página real do ERP com Supabase simulado e verifica calendário, agendas, eventos, sino, chat, arquivos, emojis, grupos, convites e navegação legada, sem enviar mensagens reais.
- `tests/collab-database.sql`: deve ser executado em `BEGIN … ROLLBACK`, após instalar as estruturas na mesma transação ou em uma base de teste compatível. Usa perfis existentes apenas como identidades de teste; todas as gravações são revertidas. Verifica autorizações, isolamento, reservas, recorrências, históricos, aprovação da exclusão e retirada de avisos após conclusão.

As notificações são internas ao ERP; não são envio por e-mail, WhatsApp nem notificações push do sistema operacional.

