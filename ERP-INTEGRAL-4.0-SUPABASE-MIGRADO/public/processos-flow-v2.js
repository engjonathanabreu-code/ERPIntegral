(() => {
'use strict';
if (window.ERPProcessFlowV2) return;
window.ERPProcessFlowV2 = true;

const LABELS = {
  'Coleta Documental': 'Documental',
  'Análise Documental': 'Documental',
  'Protocolo': 'Andamento Prefeitura',
  'Andamento': 'Andamento Registro'
};

function relabel(root=document){
  root.querySelectorAll('[data-drop-stage]').forEach(col=>{
    const stage=col.dataset.dropStage;
    if(stage==='Análise Documental'){
      col.remove();
      return;
    }
    const head=col.querySelector('.process-column-head span');
    const label=LABELS[stage];
    if(head && label && head.textContent!==label) head.textContent=label;
  });

  root.querySelectorAll('.municipio-stage-summary span').forEach(el=>{
    const first=el.childNodes[0];
    const text=first?.textContent?.trim()||'';
    if(text==='Análise Documental'){
      el.remove();
      return;
    }
    const label=LABELS[text];
    if(label && first && first.textContent!==label+' ') first.textContent=label+' ';
  });

  const select=root.querySelector('#pdStage');
  if(select){
    [...select.options].forEach(opt=>{
      const realStage=opt.getAttribute('value') || opt.value || opt.textContent.trim();
      // Mantém o valor canônico que o banco aceita e altera somente o texto visível.
      opt.value=realStage;
      if(realStage==='Análise Documental') opt.remove();
      else {
        const label=LABELS[realStage];
        if(label && opt.textContent!==label) opt.textContent=label;
      }
    });
  }

  root.querySelectorAll('.process-kpis article span').forEach(el=>{
    if(el.textContent.trim()==='Em andamento externo') el.textContent='Andamento Registro';
  });
}

let queued=false;
function queueRelabel(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;relabel();});
}

new MutationObserver(queueRelabel).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',queueRelabel);
queueRelabel();
})();