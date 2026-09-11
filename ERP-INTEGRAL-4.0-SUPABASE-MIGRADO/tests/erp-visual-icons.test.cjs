const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../public');
const source=fs.readFileSync(path.join(root,'erp-visual-icons.js'),'utf8');
const context={window:{},document:{documentElement:{},addEventListener(){}},requestAnimationFrame(){},MutationObserver:class{observe(){}}};
vm.runInNewContext(source,context);
const {stageIcon,buttonIcon}=context.window.ERPVisualIcons;
function button(text,attrs={},selector=''){
  return {textContent:text,title:attrs.title||'',getAttribute:key=>attrs[key]||null,getAttributeNames:()=>Object.keys(attrs),matches:s=>s.split(',').some(x=>selector===x),closest:()=>null};
}
test('all eight supplied artworks match their stages, including accents and existing names',()=>{
  const cases={'Análise documental e de Viabilidade':'analise-documental','Apresentação da REURB - Mobilização':'mobilizacao','Assinatura de contratos, reanálise e coleta documental':'contrato','CRF!':'crf','Matrícula do Terreno pronta':'matricula','Projeto de REURB Completo':'projeto-reurb','Protocolo do processo e acompanhamento na prefeitura':'prefeitura','Topografia, medições do Terreno':'topografia','Ortofoto dos NUIs':'topografia','Andamento Registro':'crf','Andamento Prefeitura':'prefeitura','Concluído':'matricula'};
  for(const [label,icon] of Object.entries(cases))assert.equal(stageIcon(label),icon,label);
  assert.equal(stageIcon('Ordem de serviços Financeira'),null);
});
test('navigation, tabs and action icons preserve semantic distinctions',()=>{
  assert.equal(buttonIcon(button('Projetos',{'data-view':'projects'})),'folder-kanban');
  assert.equal(buttonIcon(button('Arquivos',{},'.metas-tab')),'files');
  assert.equal(buttonIcon(button('×',{'data-del-step':'s0'})),'trash-2');
  assert.equal(buttonIcon(button('×',{},'#modalClose')),'x');
  assert.equal(buttonIcon(button('Alterar minha senha')),'key-round');
  assert.equal(buttonIcon(button('+ Adicionar etapa')),'plus');
  assert.equal(buttonIcon(button('Salvar')),'save');
  assert.equal(buttonIcon(button('Sem ação associada')),null);
});
test('every mapped UI icon has a bundled Lucide mask and every stage has its PNG',()=>{
  const css=fs.readFileSync(path.join(root,'erp-icon-assets.css'),'utf8');
  const mappings=source.slice(source.indexOf('const navigation='),source.indexOf('function stageIcon('));
  const names=[...mappings.matchAll(/(?:\]|:|,)\s*'([a-z]+(?:-[a-z0-9]+)*)'/g)].map(m=>m[1]);
  for(const name of names.filter(x=>!['analise-documental','mobilizacao','contrato','crf','matricula','projeto-reurb','prefeitura','topografia'].includes(x)))assert.ok(css.includes('data-erp-ui-icon="'+name+'"'),name);
  assert.equal(fs.readdirSync(path.join(root,'assets/reurb')).filter(x=>x.endsWith('.png')).length,8);
});
test('visual layer does not call backend, storage or register business actions',()=>{
  assert.doesNotMatch(source,/\b(fetch|supabase|localStorage|sessionStorage|rpc)\b|addEventListener\(['"](?:click|submit)/);
  assert.doesNotMatch(source,/\.innerHTML\s*=|\.onclick\s*=/);
});
