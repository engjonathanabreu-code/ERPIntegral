(() => {
  'use strict';
  const actions=['erpSettingsBtn','changeMyPassword','logout'];
  function closeMenu(restoreFocus=false){
    const menu=document.getElementById('erpAccountMenu'),toggle=document.getElementById('erpAccountToggle');
    if(!menu||menu.hidden)return;
    menu.hidden=true;toggle?.setAttribute('aria-expanded','false');
    if(restoreFocus)toggle?.focus();
  }
  function mount(){
    const foot=document.querySelector('.sidebar-foot');if(!foot)return;
    foot.parentElement.classList.add('erp-account-sidebar');
    let menu=foot.querySelector('#erpAccountMenu');
    if(!menu){
      foot.classList.add('erp-account-footer');
      const toggle=document.createElement('button');toggle.type='button';toggle.id='erpAccountToggle';toggle.className='erp-account-toggle';
      toggle.setAttribute('aria-label','Conta e ajustes');toggle.title='Conta e ajustes';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','erpAccountMenu');
      menu=document.createElement('div');menu.id='erpAccountMenu';menu.className='erp-account-menu';menu.hidden=true;
      menu.setAttribute('role','group');menu.setAttribute('aria-label','Conta e ajustes');
      toggle.addEventListener('click',()=>{
        const open=menu.hidden;menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
        if(open){window.ERPVisualIcons?.decorate(menu);menu.querySelector('button')?.focus();}
      });
      foot.append(toggle,menu);
    }
    // Move the original controls, retaining their IDs, permissions and click handlers.
    for(const id of actions){const button=document.getElementById(id);if(button&&foot.contains(button)&&button.parentElement!==menu)menu.appendChild(button);}
  }
  document.addEventListener('click',event=>{
    const toggle=document.getElementById('erpAccountToggle'),menu=document.getElementById('erpAccountMenu');
    if(!menu||menu.hidden||toggle?.contains(event.target))return;
    if(!menu.contains(event.target)||event.target.closest('button'))closeMenu();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('erpAccountMenu')?.hidden){closeMenu(true);}});
  document.addEventListener('focusin',event=>{
    const foot=document.querySelector('.erp-account-footer');if(foot&&!foot.contains(event.target))closeMenu();
  });
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  mount();
})();
