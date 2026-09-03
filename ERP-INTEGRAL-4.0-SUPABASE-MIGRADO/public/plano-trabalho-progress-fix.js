(() => {
'use strict';

function isPlanView(){
  return !!document.querySelector('.nav button.active[data-view="plans"]');
}

function forceCompletedStepProgress(){
  if(!isPlanView())return;

  document.querySelectorAll('.step').forEach(step=>{
    const statusSelect=step.querySelector('[data-step-status]');
    const readonlyStatus=!statusSelect
      ? Array.from(step.querySelectorAll('.badge')).find(x=>x.textContent.trim()==='Concluída')
      : null;
    const concluded=(statusSelect?.value==='Concluída')||!!readonlyStatus;
    if(!concluded)return;

    // Se a etapa foi concluída, todos os seus entregáveis passam a ser concluídos também.
    const pending=Array.from(step.querySelectorAll('[data-deliverable]:not(:checked)')).filter(x=>!x.disabled);
    if(pending.length){
      pending.forEach(input=>{
        input.checked=true;
        input.dispatchEvent(new Event('change',{bubbles:true}));
      });
      return;
    }

    // Garante 100% também para etapas concluídas sem entregáveis cadastrados.
    const progressBox=Array.from(step.querySelectorAll('.info-box')).find(box=>box.querySelector('b')?.textContent.trim()==='Progresso');
    if(progressBox){
      const label=progressBox.querySelector('b');
      progressBox.innerHTML='';
      progressBox.appendChild(label);
      progressBox.append('100%');
    }
  });
}

let queued=false;
function queueFix(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{
    queued=false;
    forceCompletedStepProgress();
  });
}

document.addEventListener('change',e=>{
  if(e.target?.matches?.('[data-step-status]')&&e.target.value==='Concluída'){
    setTimeout(queueFix,0);
  }
},true);

const observer=new MutationObserver(queueFix);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('erp-bridge-ready',queueFix);
queueFix();
})();
