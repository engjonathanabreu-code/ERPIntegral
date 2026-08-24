(() => {
'use strict';

function escSecurity(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function openPasswordModal(){
  document.querySelector('#passwordModal')?.remove();
  const el=document.createElement('div');
  el.id='passwordModal';
  el.className='modal-backdrop';
  el.innerHTML=`<section class="modal"><header class="modal-head"><h3>Alterar minha senha</h3><button id="passwordClose" class="btn icon ghost">×</button></header><div class="modal-body"><form id="passwordForm" class="form-grid"><div class="field full"><label>Nova senha</label><input name="password" type="password" autocomplete="new-password" minlength="8" required></div><div class="field full"><label>Confirmar nova senha</label><input name="confirm" type="password" autocomplete="new-password" minlength="8" required></div><div id="passwordStatus" class="field full muted">Use pelo menos 8 caracteres.</div></form></div><footer class="modal-foot"><button id="passwordCancel" class="btn ghost">Cancelar</button><button id="passwordSave" class="btn">Alterar senha</button></footer></section>`;
  document.body.appendChild(el);
  const close=()=>el.remove();
  el.querySelector('#passwordClose').onclick=close;
  el.querySelector('#passwordCancel').onclick=close;
  el.onclick=e=>{if(e.target===el)close();};
  el.querySelector('#passwordSave').onclick=()=>el.querySelector('#passwordForm').requestSubmit();
  el.querySelector('#passwordForm').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.target),password=String(fd.get('password')||''),confirm=String(fd.get('confirm')||''),status=el.querySelector('#passwordStatus'),save=el.querySelector('#passwordSave');
    if(password.length<8){status.textContent='A nova senha precisa ter pelo menos 8 caracteres.';return;}
    if(password!==confirm){status.textContent='As senhas informadas não são iguais.';return;}
    save.disabled=true;save.textContent='Alterando...';status.textContent='Atualizando sua senha no Supabase...';
    try{
      const client=window.__ERP_SUPABASE_CLIENT__;
      if(!client)throw new Error('Sessão do ERP não encontrada. Recarregue a página e tente novamente.');
      const {error}=await client.auth.updateUser({password});
      if(error)throw error;
      status.textContent='Senha alterada com sucesso. Ela já vale para o ERP e para os sistemas que usam a mesma conta.';
      save.textContent='Concluído';
      setTimeout(close,1400);
    }catch(err){status.textContent=`Não foi possível alterar a senha: ${escSecurity(err.message||'erro desconhecido')}`;save.disabled=false;save.textContent='Alterar senha';}
  };
}

function installSecurityButton(){
  const foot=document.querySelector('.sidebar-foot');
  if(!foot||foot.querySelector('#changeMyPassword'))return;
  const logout=foot.querySelector('#logout');
  const btn=document.createElement('button');
  btn.id='changeMyPassword';btn.className='btn secondary wide';btn.textContent='Alterar minha senha';btn.onclick=openPasswordModal;
  foot.insertBefore(btn,logout);
}

const observer=new MutationObserver(installSecurityButton);
observer.observe(document.documentElement,{childList:true,subtree:true});
installSecurityButton();
window.ERPAccountSecurity={openPasswordModal};
})();
