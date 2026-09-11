(() => {
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const navigation={dashboard:'layout-dashboard',clients:'users',projects:'folder-kanban',payments:'wallet',documents:'files',calendar:'calendar-days',plans:'clipboard-list',metas:'target',chat:'messages-square',processos:'workflow',processes:'workflow',users:'user-cog'};
  const symbols={'+':'plus','\uff0b':'plus','\u2713':'check','\u2714':'check','\u270e':'pencil','\u270f':'pencil','\u00d7':'x','\u2715':'x','\u2190':'arrow-left','\u2192':'arrow-right','\u2039':'chevron-left','\u203a':'chevron-right','\u2699':'settings','\u283f':'grip-vertical'};
  const names={plus:'Adicionar',pencil:'Editar','trash-2':'Excluir',x:'Fechar',check:'Confirmar','arrow-left':'Voltar','arrow-right':'Avançar','chevron-left':'Anterior','chevron-right':'Próximo',bell:'Notificações',settings:'Ajustes','grip-vertical':'Mover etapa'};
  const candidates='button.btn,.erp-account-toggle,.nav button,.metas-tab,[role="tab"],.collab-tab,.security-link-btn,.process-actions button,[data-stage-filter],#erpSettingsBtn';
  const stageTargets='.step-title,.project-stage .stage-main strong,.process-column-head>span,.metas-checklist-item strong,[data-stage-filter],[data-erp-icon-choice]';
  const stageRules=[
    [/\bprf\b/,'projeto-reurb'],
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
  const integralIcons={'analise-documental':'Análise documental e viabilidade',mobilizacao:'Apresentação e mobilização',contrato:'Assinatura do contrato',crf:'CRF',matricula:'Matrícula do terreno','projeto-reurb':'Projetos / PRF',prefeitura:'Prefeitura e protocolo',topografia:'Topografia e ortofoto'};
  const generalIcons={'building-2':'Institucional',users:'Equipe',target:'Marketing e metas','messages-square':'Comunicação','calendar-days':'Calendário','clipboard-list':'Planejamento',wallet:'Financeiro',files:'Documentos','file-text':'Relatório','folder-kanban':'Organização',workflow:'Processos','map-pin':'Localização','list-checks':'Checklist',clock:'Prazo',history:'Histórico','circle-check':'Conclusão',search:'Pesquisa',settings:'Configuração',paperclip:'Anexo',send:'Envio',archive:'Arquivo',eye:'Análise',pencil:'Edição','key-round':'Acesso'};
  function validChoice(value){return value==='none'||value===''||typeof value==='string'&&(value.startsWith('reurb:')&&Object.hasOwn(integralIcons,value.slice(6))||value.startsWith('ui:')&&Object.hasOwn(generalIcons,value.slice(3)));}
  function choice(value){return validChoice(value)?value:'';}
  function attributes(value){return 'data-erp-icon-choice="'+choice(value)+'"';}
  function suggestion(label){
    const stage=stageIcon(label);if(stage)return 'reurb:'+stage;
    const text=normalize(label);
    if(/institucional|instituicao/.test(text)&&!/marketing/.test(text))return 'ui:building-2';
    if(/marketing|comercial|venda/.test(text))return 'ui:target';
    if(/financeir|pagamento|cobranca/.test(text))return 'ui:wallet';
    if(/equipe|responsave/.test(text))return 'ui:users';
    if(/prazo|cronograma/.test(text))return 'ui:calendar-days';
    return '';
  }
  function choiceLabel(value){return value==='none'?'Sem ícone':value.startsWith('reurb:')?integralIcons[value.slice(6)]:value.startsWith('ui:')?generalIcons[value.slice(3)]:'Automático';}
  function glyph(value){return '<span class="erp-icon-swatch" '+attributes(value||'none')+' aria-hidden="true"></span>';}
  function pickerHtml(value='',titleField='title'){
    const selected=choice(value),field=['title','name','titulo'].includes(titleField)?titleField:'title';
    const options=entries=>Object.entries(entries).map(([value,label])=>'<button type="button" class="erp-icon-option" data-erp-icon-option="'+value+'" title="'+label+'" aria-label="'+label+'" aria-pressed="'+(value===selected)+'">'+glyph(value)+'</button>').join('');
    return '<fieldset class="field full erp-icon-picker" data-erp-title-field="'+field+'"><legend>Ícone</legend><input type="hidden" name="icon" value="'+selected+'"><details><summary><span data-erp-icon-current>'+glyph(selected)+'<span>'+choiceLabel(selected)+'</span></span></summary><div class="erp-icon-library"><div class="erp-icon-modes"><button type="button" data-erp-icon-option="" aria-pressed="'+!selected+'">Automático</button><button type="button" data-erp-icon-option="none" aria-pressed="'+(selected==='none')+'">Sem ícone</button></div><input type="search" class="erp-icon-search" placeholder="Buscar ícone" aria-label="Buscar ícone"><div class="erp-icon-suggestion" hidden><h4>Sugestão</h4><div data-erp-suggestion></div></div><section><h4>Integral · REURB</h4><div class="erp-icon-grid">'+options(Object.fromEntries(Object.entries(integralIcons).map(([k,v])=>['reurb:'+k,v])))+'</div></section><section><h4>Gerais</h4><div class="erp-icon-grid">'+options(Object.fromEntries(Object.entries(generalIcons).map(([k,v])=>['ui:'+k,v])))+'</div></section><p class="erp-icon-empty" hidden>Nenhum ícone encontrado.</p></div></details></fieldset>';
  }
  const mounted=new WeakSet();
  function mountPickers(root){
    root.querySelectorAll('.erp-icon-picker').forEach(picker=>{
      if(mounted.has(picker))return;mounted.add(picker);
      const input=picker.querySelector('input[name="icon"]'),title=picker.closest('form')?.elements[picker.dataset.erpTitleField];
      const update=()=>{
        const suggested=suggestion(title?.value||'');
        picker.querySelector('[data-erp-icon-current]').innerHTML=glyph(input.value||suggested)+'<span>'+choiceLabel(input.value)+'</span>';
        picker.querySelectorAll('[data-erp-icon-option]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.erpIconOption===input.value)));
        const host=picker.querySelector('[data-erp-suggestion]');host.parentElement.hidden=!suggested;
        host.innerHTML=suggested?'<button type="button" class="erp-icon-suggestion-button" data-erp-icon-option="'+suggested+'" aria-pressed="'+(input.value===suggested)+'">'+glyph(suggested)+choiceLabel(suggested)+'</button>':'';
      };
      picker.addEventListener('click',event=>{
        const option=event.target.closest('[data-erp-icon-option]');if(!option||!picker.contains(option))return;
        input.value=choice(option.dataset.erpIconOption);update();input.dispatchEvent(new Event('change',{bubbles:true}));
      });
      picker.querySelector('.erp-icon-search').addEventListener('input',event=>{
        const query=normalize(event.target.value);let count=0;
        picker.querySelectorAll('.erp-icon-grid button').forEach(b=>{b.hidden=!normalize(b.title).includes(query);if(!b.hidden)count++;});
        picker.querySelector('.erp-icon-empty').hidden=count>0;
      });
      picker.querySelector('.erp-icon-search').addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
      title?.addEventListener('input',update);update();
    });
  }
  function contrast(el){
    // Composite translucent surfaces from the element outward, then over white.
    let r=0,g=0,b=0,alpha=0;
    for(let parent=el;parent&&alpha<0.999;parent=parent.parentElement){
      const style=getComputedStyle(parent);
      const background=style.backgroundColor==='rgba(0, 0, 0, 0)'&&style.backgroundImage.includes('gradient')?style.backgroundImage.match(/rgba?\([^)]+\)/)?.[0]||style.backgroundColor:style.backgroundColor;
      const color=background.match(/[\d.]+/g);if(!color||color.length<3)continue;
      const a=color.length>3?Number(color[3]):1,w=a*(1-alpha);
      r+=Number(color[0])*w;g+=Number(color[1])*w;b+=Number(color[2])*w;alpha+=w;
    }
    const linear=v=>{v=(v+255*(1-alpha))/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;};
    const light=0.2126*linear(r)+0.7152*linear(g)+0.0722*linear(b);
    return light>0.179?'#000000':'#ffffff';
  }
  function buttonIcon(button){
    if(button.matches('[data-erp-stage-icon],[data-erp-picked-ui]'))return null;
    const view=button.getAttribute('data-view');
    if(navigation[view])return navigation[view];
    const attrs=button.getAttributeNames();
    if(attrs.some(name=>/^data-(del|delete)-/.test(name)))return 'trash-2';
    if(attrs.some(name=>/^data-edit-/.test(name)))return 'pencil';
    if(button.matches('[data-close],#modalClose'))return 'x';
    if(button.matches('#erpAccountToggle'))return 'user-cog';
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
    mountPickers(root);
    root.querySelectorAll(stageTargets).forEach(el=>{
      const label=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ')||el.textContent;
      const selected=choice(el.getAttribute('data-erp-icon-choice'));
      const resolved=selected||suggestion(label);
      if(resolved.startsWith('reurb:'))el.setAttribute('data-erp-stage-icon',resolved.slice(6));else el.removeAttribute('data-erp-stage-icon');
      if(resolved.startsWith('ui:'))el.setAttribute('data-erp-picked-ui',resolved.slice(3));else el.removeAttribute('data-erp-picked-ui');
    });
    root.querySelectorAll('[data-erp-stage-icon],[data-erp-picked-ui],[data-erp-ui-icon]').forEach(el=>{
      const ink=contrast(el);if(el.style.getPropertyValue('--erp-icon-ink')!==ink)el.style.setProperty('--erp-icon-ink',ink);
    });
    root.querySelectorAll(candidates).forEach(button=>{
      if(button.querySelector('svg,img')&&!button.hasAttribute('data-erp-ui-icon'))return;
      const icon=buttonIcon(button);
      if(!icon){button.removeAttribute('data-erp-ui-icon');button.removeAttribute('data-erp-ui-only');return;}
      button.setAttribute('data-erp-ui-icon',icon);
      const text=button.textContent.replace(/\ufe0f/g,'').trim(),only=!!symbols[text]||button.matches('.step-drag-handle,.erp-account-toggle');
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
  window.ERPVisualIcons={stageIcon,buttonIcon,decorate,pickerHtml,attributes,suggestion,choice,contrast};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class','style','data-theme','data-erp-theme']});
  window.addEventListener('resize',schedule);
  document.addEventListener('pointerover',schedule,{passive:true});
  document.addEventListener('DOMContentLoaded',schedule);
  schedule();
})();
