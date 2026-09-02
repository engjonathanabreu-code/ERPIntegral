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
    if(head && LABELS[stage]) head.textContent=LABELS[stage];
  });

  root.querySelectorAll('.municipio-stage-summary span').forEach(el=>{
    const text=el.childNodes[0]?.textContent?.trim()||'';
    if(text==='Análise Documental'){
      el.remove();
      return;
    }
    if(LABELS[text] && el.childNodes[0]) el.childNodes[0].textContent=LABELS[text]+' ';
  });

  const select=root.querySelector('#pdStage');
  if(select){
    [...select.options].forEach(opt=>{
      if(opt.value==='Análise Documental') opt.remove();
      else if(LABELS[opt.value]) opt.textContent=LABELS[opt.value];
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