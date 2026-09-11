(() => {
  'use strict';
  let instances=[];

  function bind({root,plans,allowed,isBusy,save}){
    instances.forEach(instance=>instance.destroy());
    instances=[];
    if(!allowed||!window.Sortable)return;
    root.querySelectorAll('[data-plan-card-id]').forEach(card=>{
      const plan=plans.find(p=>p.id===card.dataset.planCardId);
      const rows=[...card.children].filter(el=>el.classList.contains('step'));
      if(!plan||rows.length<2||rows.length!==plan.steps.length)return;
      const status=document.createElement('span');
      status.className='step-order-status';
      status.setAttribute('role','status');
      status.setAttribute('aria-live','polite');
      card.appendChild(status);
      rows.forEach((row,i)=>{
        row.dataset.stepOrderId=plan.steps[i].id;
        const handle=document.createElement('button');
        handle.type='button';
        handle.className='btn icon secondary step-drag-handle';
        handle.innerHTML='<span aria-hidden="true">&#x283f;</span>';
        handle.title='Arrastar etapa; use as setas para mover pelo teclado';
        handle.setAttribute('aria-label',`Mover etapa ${plan.steps[i].title}`);
        row.querySelector('.step-top').prepend(handle);
        handle.onclick=e=>e.stopPropagation();
        handle.onkeydown=e=>{
          if(!['ArrowUp','ArrowDown'].includes(e.key)||!row.classList.contains('collapsed'))return;
          e.preventDefault();
          if(isBusy()||saving)return;
          const ordered=orderedRows(),index=ordered.indexOf(row),target=ordered[index+(e.key==='ArrowUp'?-1:1)];
          if(!target)return;
          card.insertBefore(row,e.key==='ArrowUp'?target:target.nextSibling);
          persist();
          handle.focus();
        };
      });
      let saving=false;
      const orderedRows=()=>[...card.children].filter(el=>el.hasAttribute('data-step-order-id'));
      const ids=()=>orderedRows().map(el=>el.dataset.stepOrderId);
      let savedIds=ids();
      const restore=()=>{
        const current=orderedRows(),anchor=document.createComment('step-order');
        card.insertBefore(anchor,current[0]);
        savedIds.forEach(id=>card.insertBefore(current.find(row=>row.dataset.stepOrderId===id),anchor));
        anchor.remove();
      };
      async function persist(){
        const nextIds=ids();
        if(nextIds.every((id,i)=>id===savedIds[i]))return;
        saving=true;
        sortable.option('disabled',true);
        card.setAttribute('aria-busy','true');
        status.textContent='Salvando ordem das etapas...';
        try{
          await save(plan,nextIds);
          savedIds=nextIds;
          status.textContent='Ordem das etapas salva.';
        }catch(error){
          restore();
          status.textContent='Não foi possível salvar a ordem.';
          alert(`Não foi possível salvar a ordem das etapas. ${error.message||'Tente novamente.'}`);
        }finally{
          saving=false;
          card.removeAttribute('aria-busy');
          sortable.option('disabled',false);
        }
      }
      const sortable=window.Sortable.create(card,{
        draggable:'.step',
        handle:'.step-top',
        direction:'vertical',
        animation:150,
        dataIdAttr:'data-step-order-id',
        ghostClass:'step-order-ghost',
        chosenClass:'step-order-chosen',
        filter:(event,row)=>isBusy()||saving||!row.classList.contains('collapsed')||!!event.target.closest('.actions,input,select,textarea'),
        preventOnFilter:false,
        delay:160,
        delayOnTouchOnly:true,
        touchStartThreshold:5,
        onEnd:persist
      });
      instances.push(sortable);
    });
  }
  window.ERPPlanStepOrder={bind};
})();
