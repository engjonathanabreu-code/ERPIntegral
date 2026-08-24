(() => {
'use strict';

function addFinanceiroOption(){
  document.querySelectorAll('select[name="type"]').forEach(sel=>{
    if([...sel.options].some(o=>o.value==='Financeiro'))return;
    const o=document.createElement('option');
    o.value='Financeiro';o.textContent='Financeiro';
    sel.appendChild(o);
  });
}

const observer=new MutationObserver(addFinanceiroOption);
observer.observe(document.documentElement,{childList:true,subtree:true});
addFinanceiroOption();
})();
