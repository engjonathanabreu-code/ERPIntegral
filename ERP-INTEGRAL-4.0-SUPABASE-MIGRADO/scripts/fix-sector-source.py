from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
p=root/'public'/'metas-v2.js'
s=p.read_text(encoding='utf-8')
pattern=r"async function sectorModal\(s=\{\}\)\{.*?\nasync function deleteSector"
replacement="""async function sectorModal(s={}){
  if(B()?.refreshCore)await B().refreshCore();
  B().openModal(s.id?'Editar setor':'Novo setor',`<form id=\"metaSectorForm\" class=\"form-grid\"><div class=\"field full\"><label>Nome do setor</label><input name=\"nome\" required value=\"${esc(s.nome||'')}\"></div></form>`,()=>qs('#metaSectorForm').requestSubmit());
  qs('#metaSectorForm').onsubmit=async e=>{
    e.preventDefault();
    const nome=String(new FormData(e.target).get('nome')||'').trim();
    if(!nome)return;
    const client=sb();
    const now=new Date().toISOString();
    let r;
    if(s.id){
      r=await client.from('meta_setores').update({nome,ativo:true,updated_at:now}).eq('id',s.id).select().single();
    }else{
      const existing=await client.from('meta_setores').select('*').ilike('nome',nome).limit(1).maybeSingle();
      if(existing.error){alert(existing.error.message);return;}
      if(existing.data){
        r=await client.from('meta_setores').update({nome,ativo:true,updated_at:now}).eq('id',existing.data.id).select().single();
      }else{
        r=await client.from('meta_setores').insert({id:uid(),nome,ativo:true,created_by:currentUser().id,updated_at:now}).select().single();
      }
    }
    if(r.error){
      if(r.error.code==='23505'||/meta_setores_nome_key|duplicate key/i.test(r.error.message||''))alert('Já existe um setor com esse nome. Se ele estava inativo, atualize a tela e tente novamente.');
      else alert(r.error.message);
      return;
    }
    B().closeModal();
    await fetchAll();
    renderActive();
  };
}
async function deleteSector"""
ns,n=re.subn(pattern,replacement,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit(f'sectorModal nao localizado: {n}')
p.write_text(ns,encoding='utf-8')
idx=root/'public'/'index.html'
x=idx.read_text(encoding='utf-8')
x=x.replace('metas-v2.js?v=21','metas-v2.js?v=22')
idx.write_text(x,encoding='utf-8')
