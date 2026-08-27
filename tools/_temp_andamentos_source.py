from pathlib import Path
import re

app = Path('ERP-INTEGRAL-4.0-SUPABASE-MIGRADO/public/app.js')
s = app.read_text()
new = r'''const PROGRESS_GROUPS_STORAGE='erp_integral_progress_groups_collapsed';
function progressGroupState(){try{return JSON.parse(localStorage.getItem(PROGRESS_GROUPS_STORAGE)||'{}')}catch{return {}}}
function setProgressGroupCollapsed(key,value){const state=progressGroupState();state[key]=value;try{localStorage.setItem(PROGRESS_GROUPS_STORAGE,JSON.stringify(state))}catch{}}
function projectPlanProgress(p){
  const plan=db.plans.find(x=>x.projectId===p.id);
  const total=plan?.steps.length||0;
  const done=plan?.steps.filter(s=>s.status==='Concluída').length||0;
  const pct=total?Math.round(done/total*100):0;
  return {plan,total,done,pct};
}
function renderProgress(){
  title('Andamentos dos projetos');
  const q=searchTerm.trim().toLowerCase();
  const filtered=db.projects.filter(p=>!q||(`${p.name} ${p.type||''} ${p.status||''}`).toLowerCase().includes(q));
  const collapsed=progressGroupState();
  const groups={};
  filtered.forEach(p=>{
    const type=p.type||'OUTROS';
    const info=projectPlanProgress(p);
    (groups[type]??=[]).push({p,...info});
  });
  Object.values(groups).forEach(list=>list.sort((a,b)=>b.pct-a.pct||b.done-a.done||b.total-a.total||projectProgress(b.p)-projectProgress(a.p)||a.p.name.localeCompare(b.p.name,'pt-BR',{sensitivity:'base'})));
  const typeOrder=[...SERVICE_TYPES,...Object.keys(groups).filter(t=>!SERVICE_TYPES.includes(t)).sort((a,b)=>a.localeCompare(b,'pt-BR'))];
  const sections=typeOrder.filter(t=>groups[t]?.length).map(type=>{
    const list=groups[type];
    const isCollapsed=!!collapsed[type];
    const leader=list[0];
    const avg=list.length?Math.round(list.reduce((sum,x)=>sum+x.pct,0)/list.length):0;
    return `<section class="progress-type-group ${isCollapsed?'collapsed':''}" data-progress-group="${esc(type)}"><button type="button" class="progress-type-head" data-toggle-progress-group="${esc(type)}" aria-expanded="${isCollapsed?'false':'true'}"><div class="progress-type-title"><span class="progress-type-chevron">⌄</span><div><strong>${esc(type)}</strong><small>${list.length} projeto${list.length===1?'':'s'} · média ${avg}%</small></div></div><div class="progress-type-highlight"><span>Mais adiantado</span><b>${esc(leader.p.name)}</b><em>${leader.pct}%</em></div></button><div class="progress-type-body"><div class="table-wrap progress-type-table-wrap"><table class="table progress-table"><thead><tr><th>Projeto</th><th>Status</th><th>Etapas</th><th>Progresso</th></tr></thead><tbody>${list.map(({p,total,done,pct})=>`<tr><td><button class="project-link" data-project="${p.id}">${esc(p.name)}</button></td><td>${statusBadge(p.status||'Ativo')}</td><td><span class="progress-stage-count">${done}/${total}</span></td><td><div class="progress-cell"><div class="progress"><i style="width:${pct}%"></i></div><b>${pct}%</b></div></td></tr>`).join('')}</tbody></table></div></div></section>`;
  }).join('');
  $('#content').innerHTML=`<div class="toolbar progress-toolbar"><div class="left"><input id="searchProgress" class="search" placeholder="Buscar por projeto, tipo ou status" value="${esc(searchTerm)}"></div><div class="right"><span class="muted">Dentro de cada tipo, os projetos mais adiantados aparecem primeiro.</span></div></div><div class="progress-type-groups">${sections||'<div class="empty">Nenhum projeto encontrado.</div>'}</div>`;
  $('#searchProgress').oninput=e=>{searchTerm=e.target.value;renderProgress()};
  $$('[data-toggle-progress-group]').forEach(b=>b.onclick=()=>{const key=b.dataset.toggleProgressGroup;setProgressGroupCollapsed(key,!progressGroupState()[key]);renderProgress()});
  $$('[data-project]').forEach(b=>b.onclick=()=>{currentProjectId=b.dataset.project;currentView='projects';renderApp()});
}

function renderClients(){'''
pat = r"function renderProgress\(\)\{.*?\n\}\n\nfunction renderClients\(\)\{"
s2, n = re.subn(pat, new, s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'Esperava substituir 1 renderProgress, substituí {n}.')
app.write_text(s2)

css = Path('ERP-INTEGRAL-4.0-SUPABASE-MIGRADO/public/styles.css')
c = css.read_text()
marker = '/* ANDAMENTOS_POR_TIPO_SOURCE_V1 */'
if marker not in c:
    c += r'''

/* ANDAMENTOS_POR_TIPO_SOURCE_V1 */
.progress-toolbar{margin-bottom:16px}.progress-toolbar .right{max-width:520px;text-align:right}.progress-type-groups{display:grid;gap:14px}.progress-type-group{border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:0 5px 18px rgba(15,95,91,.06);overflow:hidden}.progress-type-head{width:100%;border:0;background:linear-gradient(180deg,#fff 0%,#f8fbfa 100%);padding:16px 18px;display:flex;justify-content:space-between;align-items:center;gap:24px;text-align:left;color:var(--text)}.progress-type-head:hover{background:#f4f9f8}.progress-type-title{display:flex;align-items:center;gap:12px;min-width:0}.progress-type-title>div{display:flex;flex-direction:column;gap:3px}.progress-type-title strong{font-size:15px;color:var(--primary);letter-spacing:.01em}.progress-type-title small{font-size:11px;color:var(--muted);font-weight:600}.progress-type-chevron{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:#e8f2f1;color:var(--primary);font-size:16px;transition:.16s transform;flex:0 0 auto}.progress-type-highlight{display:grid;grid-template-columns:auto minmax(140px,1fr) auto;align-items:center;gap:10px;min-width:360px}.progress-type-highlight span{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:800}.progress-type-highlight b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}.progress-type-highlight em{font-style:normal;font-size:13px;font-weight:800;color:var(--primary);background:#e8f2f1;border-radius:999px;padding:5px 9px}.progress-type-body{border-top:1px solid var(--line)}.progress-type-table-wrap{border:0;border-radius:0}.progress-table{min-width:720px}.progress-table th:first-child,.progress-table td:first-child{padding-left:18px}.progress-table th:last-child,.progress-table td:last-child{padding-right:18px}.progress-table td{vertical-align:middle}.progress-table tr:last-child td{border-bottom:0}.progress-cell{display:grid;grid-template-columns:minmax(120px,1fr) 44px;align-items:center;gap:10px;max-width:260px}.progress-cell .progress{margin:0;height:7px}.progress-cell b{font-size:11px;color:var(--muted);font-weight:700}.progress-stage-count{font-size:12px;font-weight:700;color:var(--text)}.progress-type-group.collapsed .progress-type-body{display:none}.progress-type-group.collapsed .progress-type-chevron{transform:rotate(-90deg)}
@media(max-width:900px){.progress-type-head{align-items:flex-start}.progress-type-highlight{min-width:0;grid-template-columns:1fr auto}.progress-type-highlight span{grid-column:1/-1}.progress-toolbar .right{display:none}}
@media(max-width:650px){.progress-type-head{flex-direction:column;gap:12px}.progress-type-highlight{width:100%}.progress-type-title strong{font-size:14px}}
'''
css.write_text(c)
