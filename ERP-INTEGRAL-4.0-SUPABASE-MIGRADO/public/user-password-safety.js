(() => {
'use strict';

function protectPasswordField(form){
  const input=form?.querySelector('input[name="password"]');
  if(!input||input.dataset.passwordSafety==='1')return;
  input.dataset.passwordSafety='1';
  input.autocomplete='new-password';
  input.value='';
  let intentional=false;
  const mark=()=>{intentional=true;input.dataset.intentionalPassword='1'};
  input.addEventListener('keydown',mark,{capture:true});
  input.addEventListener('paste',mark,{capture:true});
  input.addEventListener('pointerdown',()=>{input.value='';},{once:true,capture:true});
  form.addEventListener('submit',()=>{
    if(!intentional)input.value='';
  },{capture:true});
}

const observer=new MutationObserver(()=>{
  const form=document.querySelector('#userForm');
  if(form)protectPasswordField(form);
});
observer.observe(document.body,{childList:true,subtree:true});
})();
