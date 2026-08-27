from pathlib import Path

p=Path('ERP-INTEGRAL-4.0-SUPABASE-MIGRADO/public/app.js')
s=p.read_text()

repls=[
("const METAS_SECTORS=['Projetos','Topografia','Pós-protocolo','Jurídico','Atendimentos'];",
 "const METAS_SECTORS=['Projetos','Topografia','Pós-protocolo','Jurídico'];"),
("function navItems(){if(isAdmin())return ADMIN_NAV;if(isComercial())return COMERCIAL_NAV;if(isProjectAccessManager())return [['projects','Projetos'],['plans','Planos de trabalho'],['metas','Metas']];if(isTechDirector())return [['metas','Metas']];if(isMetasSector())return [['plans','Planos de trabalho'],['metas','Metas']];return [['plans','Planos de trabalho']];}",
 "function navItems(){if(isAdmin())return ADMIN_NAV;if(isProjectAccessManager())return [['projects','Projetos'],['plans','Planos de trabalho'],['metas','Metas']];if(isMetasSector())return [['plans','Planos de trabalho'],['metas','Metas']];if(isComercial())return COMERCIAL_NAV;if(isTechDirector())return [['metas','Metas']];return [['plans','Planos de trabalho']];}"),
("<div class=\"toolbar\"><div class=\"left\"><input id=\"searchProjects\" class=\"search\" placeholder=\"Pesquisar projeto, cliente, tipo ou responsável\" value=\"${esc(searchTerm)}\"></div><div class=\"right\"><button id=\"newProject\" class=\"btn\">Adicionar projeto</button></div></div>",
 "<div class=\"toolbar\"><div class=\"left\"><input id=\"searchProjects\" class=\"search\" placeholder=\"Pesquisar projeto, cliente, tipo ou responsável\" value=\"${esc(searchTerm)}\"></div><div class=\"right\">${canManageCore()?'<button id=\"newProject\" class=\"btn\">Adicionar projeto</button>':''}</div></div>"),
("<td class=\"actions\"><button class=\"btn icon secondary\" data-edit-project=\"${p.id}\" title=\"Editar\">✎</button><button class=\"btn icon danger\" data-del-project=\"${p.id}\" title=\"Excluir\">×</button></td>",
 "<td class=\"actions\">${canManageCore()?`<button class=\"btn icon secondary\" data-edit-project=\"${p.id}\" title=\"Editar\">✎</button><button class=\"btn icon danger\" data-del-project=\"${p.id}\" title=\"Excluir\">×</button>`:''}</td>"),
("  $('#newProject').onclick=()=>projectModal();\n  $$('[data-open-project]').forEach(b=>b.onclick=()=>{currentProjectId=b.dataset.openProject;renderProjects()});\n  $$('[data-edit-project]').forEach(b=>b.onclick=()=>projectModal(findProject(b.dataset.editProject)));\n  $$('[data-del-project]').forEach(b=>b.onclick=()=>deleteProject(b.dataset.delProject));",
 "  if(canManageCore())$('#newProject')?.addEventListener('click',()=>projectModal());\n  $$('[data-open-project]').forEach(b=>b.onclick=()=>{currentProjectId=b.dataset.openProject;renderProjects()});\n  if(canManageCore()){\n    $$('[data-edit-project]').forEach(b=>b.onclick=()=>projectModal(findProject(b.dataset.editProject)));\n    $$('[data-del-project]').forEach(b=>b.onclick=()=>deleteProject(b.dataset.delProject));\n  }"),
("<div class=\"toolbar project-detail-toolbar\"><button id=\"backProjects\" class=\"btn ghost\">← Voltar</button><div class=\"right\"><button id=\"editProjectDetail\" class=\"btn icon secondary\" title=\"Editar projeto\">✎</button><button id=\"delProjectDetail\" class=\"btn icon danger\" title=\"Excluir projeto\">×</button></div></div>",
 "<div class=\"toolbar project-detail-toolbar\"><button id=\"backProjects\" class=\"btn ghost\">← Voltar</button><div class=\"right\">${canManageCore()?'<button id=\"editProjectDetail\" class=\"btn icon secondary\" title=\"Editar projeto\">✎</button><button id=\"delProjectDetail\" class=\"btn icon danger\" title=\"Excluir projeto\">×</button>':''}</div></div>"),
("<div class=\"section-head\"><div><h4>Etapas do projeto</h4><span class=\"muted\">${p.stages.length} etapa(s)</span></div><button id=\"addProjectStage\" class=\"btn icon secondary\" title=\"Adicionar etapa\">＋</button></div>",
 "<div class=\"section-head\"><div><h4>Etapas do projeto</h4><span class=\"muted\">${p.stages.length} etapa(s)</span></div>${canManageCore()?'<button id=\"addProjectStage\" class=\"btn icon secondary\" title=\"Adicionar etapa\">＋</button>':''}</div>"),
("<div class=\"actions stage-buttons\"><button class=\"btn icon secondary\" data-edit-stage=\"${s.id}\" title=\"Editar\">✎</button><button class=\"btn icon danger\" data-del-stage=\"${s.id}\" title=\"Excluir\">×</button></div>",
 "${canManageCore()?`<div class=\"actions stage-buttons\"><button class=\"btn icon secondary\" data-edit-stage=\"${s.id}\" title=\"Editar\">✎</button><button class=\"btn icon danger\" data-del-stage=\"${s.id}\" title=\"Excluir\">×</button></div>`:''}"),
("  $('#backProjects').onclick=()=>{currentProjectId=null;renderProjects()};\n  $('#editProjectDetail').onclick=()=>projectModal(p);$('#delProjectDetail').onclick=()=>deleteProject(p.id);$('#addProjectStage').onclick=()=>stageModal(p);",
 "  $('#backProjects').onclick=()=>{currentProjectId=null;renderProjects()};\n  if(canManageCore()){\n    $('#editProjectDetail')?.addEventListener('click',()=>projectModal(p));\n    $('#delProjectDetail')?.addEventListener('click',()=>deleteProject(p.id));\n    $('#addProjectStage')?.addEventListener('click',()=>stageModal(p));\n  }"),
("  $$('[data-edit-stage]').forEach(b=>b.onclick=()=>stageModal(p,p.stages.find(x=>x.id===b.dataset.editStage)));\n  $$('[data-del-stage]').forEach(b=>b.onclick=()=>{if(confirm('Excluir etapa do projeto?')){p.stages=p.stages.filter(x=>x.id!==b.dataset.delStage);saveDB();renderProjectDetail()}});",
 "  if(canManageCore()){\n    $$('[data-edit-stage]').forEach(b=>b.onclick=()=>stageModal(p,p.stages.find(x=>x.id===b.dataset.editStage)));\n    $$('[data-del-stage]').forEach(b=>b.onclick=()=>{if(confirm('Excluir etapa do projeto?')){p.stages=p.stages.filter(x=>x.id!==b.dataset.delStage);saveDB();renderProjectDetail()}});\n  }"),
]

for old,new in repls:
    if old not in s:
        raise SystemExit(f'Trecho não encontrado: {old[:160]}')
    s=s.replace(old,new,1)

p.write_text(s)
