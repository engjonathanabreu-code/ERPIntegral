(() => {
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const navigation={dashboard:'layout-dashboard',clients:'users',projects:'folder-kanban',payments:'wallet',documents:'files',calendar:'calendar-days',plans:'clipboard-list',metas:'target',chat:'messages-square',processos:'workflow',processes:'workflow',users:'user-cog'};
  const symbols={'+':'plus','\uff0b':'plus','\u2713':'check','\u2714':'check','\u270e':'pencil','\u270f':'pencil','\u00d7':'x','\u2715':'x','\u2190':'arrow-left','\u2192':'arrow-right','\u2039':'chevron-left','\u203a':'chevron-right','\u2699':'settings','\u283f':'grip-vertical'};
  const names={plus:'Adicionar',pencil:'Editar','trash-2':'Excluir',x:'Fechar',check:'Confirmar','arrow-left':'Voltar','arrow-right':'Avançar','chevron-left':'Anterior','chevron-right':'Próximo',bell:'Notificações',settings:'Ajustes','grip-vertical':'Mover etapa'};
  const candidates='button.btn,.nav button,.metas-tab,[role="tab"],.collab-tab,.security-link-btn,.process-actions button,[data-stage-filter],#erpSettingsBtn';
  const stageTargets='.step-title,.project-stage .stage-main strong,.process-column-head>span,.metas-checklist-item strong,[data-stage-filter]';
  const stageRules=[
    [/matricula|^concluido$/,'matricula'],[/\bcrf\b|certidao.*regularizacao|andamento registro/,'crf'],
    [/assinatura.*contrat|contrat.*assinatura/,'contrato'],[/prefeitura|protocolo/,'prefeitura'],
    [/topograf|ortofoto|medic.*terreno|levantamento.*(terreno|planialt)/,'topografia'],
    [/projeto.*reurb|^projetos$|elaboracao.*projeto/,'projeto-reurb'],
    [/documental|viabilidade|coleta.*document/,'analise-documental'],
    [/mobiliz|apresentacao.*reurb|reuniao.*(tecnico|comercial)|^comercial$/,'mobilizacao']
  ];
  const actionRules=[
    [/notifica/,'bell'],[/senha/,'key-round'],[/ajustes|configurac/,'settings'],[/sair|logout/,'log-out'],[/^entrar$/,'log-in'],
    [/voltar/,'arrow-left'],[/excluir|apagar|remover/,'trash-2'],[/cancelar|fechar/,'x'],[/editar/,'pencil'],[/salv|grav|alterar/,'save'],
    [/sincroniz|atualiz|recarreg/,'refresh-cw'],[/pesquis|buscar/,'search'],[/filtr|^todos\b/,'filter'],[/historico/,'history'],
    [/checklist|entregaveis/,'list-checks'],[/comentario|chat/,'messages-square'],[/calendario|agenda/,'calendar-days'],[/prazo|semana/,'clock'],
    [/baixar|download|exportar/,'download'],[/enviar.*arquivo|upload|importar/,'upload'],[/anexar/,'paperclip'],[/enviar/,'send'],
    [/adicionar|criar|novo|nova/,'plus'],[/aprovar|confirmar|marcar paga|concluir/,'check'],[/reabrir|desfazer/,'undo-2'],
    [/visualiz/,'eye'],[/copiar|duplicar/,'copy'],[/arquivar/,'archive'],[/abrir/,'external-link']
  ];
  function stageIcon(label){
    const text=normalize(label).replace(/\s+\d+\s*$/,'');
    return stageRules.find(([pattern])=>pattern.test(text))?.[1]||null;
  }
  function buttonIcon(button){
    if(button.matches('[data-erp-stage-icon]'))return null;
    const view=button.getAttribute('data-view');
    if(navigation[view])return navigation[view];
    const attrs=button.getAttributeNames();
    if(attrs.some(name=>/^data-(del|delete)-/.test(name)))return 'trash-2';
    if(attrs.some(name=>/^data-edit-/.test(name)))return 'pencil';
    if(button.matches('[data-close],#modalClose'))return 'x';
    if(button.matches('.step-drag-handle'))return 'grip-vertical';
    const text=normalize(button.textContent).replace(/\ufe0f/g,'');
    if(symbols[text])return symbols[text];
    const label=normalize(button.getAttribute('aria-label')||button.title||button.textContent);
    if(/arquivo|documento/.test(label)&&button.matches('.metas-tab,[role="tab"],.collab-tab'))return 'files';
    if(button.closest('.nav')&&/processos/.test(text))return 'workflow';
    if(button.closest('.nav')&&/metas/.test(text))return 'target';
    return actionRules.find(([pattern])=>pattern.test(label))?.[1]||null;
  }
  function hideLegacyPrefix(button){
    // Preserve textContent for existing selectors; hide only the old decorative glyph.
    if(button.querySelector('.erp-legacy-glyph'))return;
    const node=[...button.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
    const match=node?.textContent.match(/^(\s*[+\uff0b\u2190\u2192\u2699\u270e\u270f]\ufe0f?\s*)/);
    if(!match||!node.textContent.slice(match[0].length).trim())return;
    node.splitText(match[0].length);
    const span=document.createElement('span');span.className='erp-legacy-glyph';span.setAttribute('aria-hidden','true');
    node.before(span);span.appendChild(node);
  }
  function decorate(root=document){
    root.querySelectorAll(stageTargets).forEach(el=>{
      const label=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ')||el.textContent;
      const icon=stageIcon(label);
      if(icon)el.setAttribute('data-erp-stage-icon',icon);else el.removeAttribute('data-erp-stage-icon');
    });
    root.querySelectorAll(candidates).forEach(button=>{
      if(button.querySelector('svg,img')&&!button.hasAttribute('data-erp-ui-icon'))return;
      const icon=buttonIcon(button);
      if(!icon){button.removeAttribute('data-erp-ui-icon');button.removeAttribute('data-erp-ui-only');return;}
      button.setAttribute('data-erp-ui-icon',icon);
      const text=button.textContent.replace(/\ufe0f/g,'').trim(),only=!!symbols[text]||button.matches('.step-drag-handle');
      button.toggleAttribute('data-erp-ui-only',only);
      if(only){
        const label=button.getAttribute('aria-label')||button.title||names[icon]||'Ação';
        if(!button.hasAttribute('aria-label'))button.setAttribute('aria-label',label);
        if(!button.title)button.title=label;
      }else hideLegacyPrefix(button);
    });
  }
  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();});}
  window.ERPVisualIcons={stageIcon,buttonIcon,decorate};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,characterData:true,subtree:true});
  document.addEventListener('DOMContentLoaded',schedule);
  schedule();
})();
