const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../public');
const source=fs.readFileSync(path.join(root,'erp-visual-icons.js'),'utf8');
const context={window:{addEventListener(){}},document:{documentElement:{},addEventListener(){}},getComputedStyle:el=>el.css,requestAnimationFrame(){},MutationObserver:class{observe(){}}};
vm.runInNewContext(source,context);
const {stageIcon,buttonIcon,suggestion,choice,pickerHtml,contrast}=context.window.ERPVisualIcons;
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
test('every mapped UI icon has a bundled Lucide mask and every stage has true vector paths',()=>{
  const css=fs.readFileSync(path.join(root,'erp-icon-assets.css'),'utf8');
  const mappings=source.slice(source.indexOf('const navigation='),source.indexOf('function stageIcon('));
  const names=[...mappings.matchAll(/(?:\]|:|,)\s*'([a-z]+(?:-[a-z0-9]+)*)'/g)].map(m=>m[1]);
  for(const name of names.filter(x=>!['analise-documental','mobilizacao','contrato','crf','matricula','projeto-reurb','prefeitura','topografia'].includes(x)))assert.ok(css.includes('data-erp-ui-icon="'+name+'"'),name);
  const files=fs.readdirSync(path.join(root,'assets/reurb')).filter(x=>x.endsWith('.svg'));
  assert.equal(files.length,8);
  for(const file of files){const svg=fs.readFileSync(path.join(root,'assets/reurb',file),'utf8');assert.match(svg,/<path /);assert.match(svg,/viewBox=/);assert.doesNotMatch(svg,/<image|base64|<script/);}
  assert.doesNotMatch(css,/\.png/);
});
test('visual layer never writes backend data, submits forms or replaces business event handlers',()=>{
  assert.doesNotMatch(source,/\b(fetch|supabase|localStorage|sessionStorage|rpc|requestSubmit)\b|addEventListener\(['"]submit/);
  assert.doesNotMatch(source,/\.onclick\s*=|\.onsubmit\s*=/);
});
test('PRF suggestions and general suggestions do not overwrite explicit choices',()=>{
  assert.equal(suggestion('Elaboração de PRF'),'reurb:projeto-reurb');
  assert.equal(suggestion('prf - aprovação'),'reurb:projeto-reurb');
  assert.equal(suggestion('Fase institucional'),'ui:building-2');
  assert.equal(suggestion('Marketing Institucional'),'ui:target');
  assert.equal(choice('ui:wallet'),'ui:wallet');
  assert.equal(choice('none'),'none');
  assert.equal(choice('javascript:alert(1)'),'');
  assert.equal(choice('reurb:__proto__'),'');
  const html=pickerHtml('ui:wallet');
  assert.match(html,/name="icon" value="ui:wallet"/);
  assert.match(html,/Integral · REURB/);assert.match(html,/>Gerais</);
  assert.doesNotMatch(html,/<button(?![^>]*type="button")/);
});
test('contrast is black on white and white on dark, including transparent child and gradient',()=>{
  const surface=backgroundColor=>({css:{backgroundColor,backgroundImage:'none'},parentElement:null});
  assert.equal(contrast(surface('rgb(255, 255, 255)')),'#000000');
  assert.equal(contrast(surface('rgb(12, 30, 30)')),'#ffffff');
  const child=surface('rgba(0, 0, 0, 0)');child.parentElement=surface('rgb(15, 80, 76)');
  assert.equal(contrast(child),'#ffffff');
  child.parentElement.css={backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'linear-gradient(rgb(13, 77, 73), rgb(15, 98, 93))'};
  assert.equal(contrast(child),'#ffffff');
});
test('core exposes optional choices in all five edit forms and reads saved icons',()=>{
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.equal((app.match(/ERPVisualIcons\?\.pickerHtml\(/g)||[]).length,5);
  assert.equal((app.match(/icon:[xs]\.icone\|\|''/g)||[]).length,4);
  assert.match(app,/icone:p\.icon\|\|null/);
  assert.match(app,/icone:s\.icon\|\|null/);
  assert.match(app,/icone:\(window\.ERPVisualIcons\?\.choice\(fd\.get\('icon'\)\)/);
});
