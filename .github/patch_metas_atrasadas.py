from pathlib import Path

base=Path('ERP-INTEGRAL-4.0-SUPABASE-MIGRADO/public')
app_path=base/'app.js'
css_path=base/'styles.css'
index_path=base/'index.html'
app=app_path.read_text(encoding='utf-8')

old="""${active.length?`<div class=\"metas2-card-grid\">${active.slice(0,15).map(metaCardHtml).join('')}</div>`:'<div class=\"empty compact\">Nenhuma meta ativa.</div>'}</section><h3 class=\"section-title\">Colaboradores</h3>"""
new="""${active.length?`<div class=\"metas2-card-grid\">${active.slice(0,15).map(metaCardHtml).join('')}</div>`:'<div class=\"empty compact\">Nenhuma meta ativa.</div>'}</section><section class=\"card metas2-late-home\"><div class=\"section-head\"><div><h3>Metas atrasadas</h3><p class=\"muted\">Metas com prazo vencido que ainda precisam de atenção.</p></div><button type=\"button\" class=\"btn small secondary\" id=\"metaLateAll\">Ver todas</button></div>${late.length?`<div class=\"metas2-card-grid\">${late.slice(0,15).map(metaLateCardHtml).join('')}</div>`:'<div class=\"empty compact\">Nenhuma meta atrasada.</div>'}</section><h3 class=\"section-title\">Colaboradores</h3>"""
if old not in app:
    raise SystemExit('Trecho da home de Metas não encontrado')
app=app.replace(old,new,1)

old_wire="wireToolbar();qs('#metaActiveAll')?.addEventListener('click',()=>{state.screen='active';renderActive()});wireMetaCards();"
new_wire="wireToolbar();qs('#metaActiveAll')?.addEventListener('click',()=>{state.screen='active';renderActive()});qs('#metaLateAll')?.addEventListener('click',()=>{state.screen='active';renderActive('late')});wireMetaCards();"
if old_wire not in app:
    raise SystemExit('Wire da home de Metas não encontrado')
app=app.replace(old_wire,new_wire,1)

needle="function metaCardHtml(m){const resp=metaResponsibles(m.id).map(userName).join(', ')||'Sem responsável';const action=conclusionActionHtml(m);return `<button type=\"button\" class=\"metas2-card\" data-meta-card=\"${m.id}\"><div class=\"metas2-card-top\"><strong>${esc(m.titulo)}</strong>${statusBadge(m.status)}</div><span class=\"muted metas2-assoc\">${esc(associationLabel(m))}</span><p>${esc(m.observacoes||'Sem observações.')}</p><div class=\"metas2-card-foot\"><span>${esc(sectorLabel(m.setor_id))}</span><span>${m.prazo?'Prazo '+brDate(m.prazo):'Sem prazo'}</span></div><small>${esc(resp)}</small>${action?`<div class=\"meta-conclusion-row\">${action}</div>`:''}</button>`}\n"
add=needle+"function metaLateCardHtml(m){const resp=metaResponsibles(m.id).map(userName).join(', ')||'Sem responsável';const action=conclusionActionHtml(m);return `<button type=\"button\" class=\"metas2-card metas2-card-late\" data-meta-card=\"${m.id}\"><div class=\"metas2-card-top\"><strong>${esc(m.titulo)}</strong><span class=\"badge danger\">Atrasado</span></div><span class=\"muted metas2-assoc\">${esc(associationLabel(m))}</span><p>${esc(m.observacoes||'Sem observações.')}</p><div class=\"metas2-card-foot\"><span>${esc(sectorLabel(m.setor_id))}</span><span class=\"meta-late-deadline\">${m.prazo?'Prazo '+brDate(m.prazo):'Sem prazo'}</span></div><small>${esc(resp)}</small>${action?`<div class=\"meta-conclusion-row\">${action}</div>`:''}</button>`}\n"
if needle not in app:
    raise SystemExit('metaCardHtml não encontrado')
app=app.replace(needle,add,1)

old_active="function renderActive(){\n  state.screen='active';B().title('Metas Ativas');const active=visibleMetas().filter(m=>!['Concluído','Cancelado'].includes(m.status));"
new_active="function renderActive(mode='all'){\n  state.screen='active';const allActive=visibleMetas().filter(m=>!['Concluído','Cancelado'].includes(m.status));const active=mode==='late'?allActive.filter(m=>m.prazo&&m.prazo<today()):allActive;B().title(mode==='late'?'Metas Atrasadas':'Metas Ativas');"
if old_active not in app:
    raise SystemExit('renderActive não encontrado')
app=app.replace(old_active,new_active,1)

app_path.write_text(app,encoding='utf-8')

css=css_path.read_text(encoding='utf-8')
marker='/* METAS_ATRASADAS_HOME_V1 */'
if marker not in css:
    css += '''\n\n/* METAS_ATRASADAS_HOME_V1 */\n.metas2-late-home .section-head h3{color:#8f1f25}\n.metas2-card-late{border-color:#efcfd1;background:linear-gradient(180deg,#fff 0%,#fffafa 100%)}\n.metas2-card-late:hover{border-color:#dca7ab}\n.metas2-card-late .meta-late-deadline{color:#b4232b;font-weight:700}\n.metas2-card-late .badge.danger{background:#fde8ea;color:#b4232b}\n'''
    css_path.write_text(css,encoding='utf-8')

index=index_path.read_text(encoding='utf-8')
index=index.replace('styles.css?v=18','styles.css?v=19').replace('app.js?v=18','app.js?v=19')
index_path.write_text(index,encoding='utf-8')
