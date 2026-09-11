// Run with Playwright installed; uses synthetic data and never contacts production.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.join(__dirname,'../public');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const declarations=[
  source.slice(source.indexOf('async function savePlanStepOrder('),source.indexOf('function wirePlanEvents(')),
  source.slice(source.indexOf('function planCard('),source.indexOf('function updateStepField('))
].join('\n');
const html=`<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="plans-v2.css"><title>Planos de trabalho</title><header class="topbar"><h2>Planos de trabalho</h2></header><main id="content" class="content"></main><script src="vendor/Sortable-1.15.7.min.js"></script><script src="plan-step-order.js"></script><script>
const flags=new URLSearchParams(location.search);
let allowed=!flags.has('readonly'),syncing=flags.has('busy'),remoteLoaded=true,planStepOrderSave=null,fail=flags.has('fail');
const canManageCore=()=>allowed,canEditStep=()=>true,findUser=()=>({name:'Equipe'}),findProject=()=>({name:'Projeto de teste'}),daysUntil=()=>30,brDate=x=>x||'-',stepObservationsHtml=()=>'<p>Observação preservada</p>';
const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
let plans=JSON.parse(localStorage.getItem('plans')||'null')||[{id:'plan',title:'Plano de teste',status:'Em andamento',steps:['Reunião Técnico/Comercial','Marketing Institucional','Ortofoto dos NUIs','Ação comercial e marketing de venda','Análise documental e coleta de documentos faltantes'].map((title,i)=>({id:'s'+i,title,responsibleIds:['team'],deliverables:[{id:'d'+i,text:'Documento',done:false}],status:'Pendente',notes:'keep'}))}];
window.requests=[];window.alerts=[];window.alert=message=>alerts.push(message);
const cacheDB=()=>localStorage.setItem('plans',JSON.stringify(plans));
const sb={rpc:async(name,args)=>{requests.push({name,args});await new Promise(resolve=>setTimeout(resolve,30));return {error:fail?{message:'Falha simulada'}:null};}};
${declarations}
function draw(){
  document.querySelector('#content').innerHTML=plans.map(planCard).join('');
  window.ERPPlanStepOrder.bind({root:document.querySelector('#content'),plans,allowed,isBusy:()=>syncing||!!planStepOrderSave,save:savePlanStepOrder});
  document.querySelectorAll('[data-toggle-step]').forEach(b=>b.onclick=()=>{const step=b.closest('.step');step.classList.toggle('collapsed');b.setAttribute('aria-expanded',String(!step.classList.contains('collapsed')))});
  document.querySelectorAll('[data-edit-step],[data-del-step]').forEach(b=>b.onclick=()=>window.lastAction=b.hasAttribute('data-edit-step')?'edit':'delete');
}
draw();
</script></html>`;
async function run(){
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html.replace('<title>','<link rel="stylesheet" href="erp-responsive.css"><link rel="stylesheet" href="erp-buttons-refined.css"><title>'));}
    const file=path.join(root,pathname);
    if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  if(process.env.SERVE_ONLY){console.log('Fixture: http://127.0.0.1:'+server.address().port);return;}
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    const order=()=>page.locator('.step[data-step-order-id]').evaluateAll(rows=>rows.map(row=>row.dataset.stepOrderId));
    const settled=()=>page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
    async function drag(sourceId,targetId,handle='.step-drag-handle'){
      const from=page.locator('[data-step-order-id="'+sourceId+'"] '+handle),target=page.locator('[data-step-order-id="'+targetId+'"]');
      const a=await from.boundingBox(),b=await target.boundingBox();
      await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
      await page.mouse.move(a.x+a.width/2,a.y+a.height/2+12,{steps:5});
      await page.mouse.move(b.x+b.width/2,b.y+(a.y<b.y?b.height-8:8),{steps:25});
      await page.waitForTimeout(200);await page.mouse.up();await settled();
    }
    assert.equal(await page.locator('.step-drag-handle:visible').count(),5);
    await drag('s0','s2');assert.deepEqual(await order(),['s1','s2','s0','s3','s4']);
    await drag('s0','s1','.step-toggle');assert.deepEqual(await order(),['s0','s1','s2','s3','s4']);
    assert.equal(await page.locator('.step:not(.collapsed)').count(),0);
    await page.locator('[data-step-order-id="s1"] .step-toggle').click();
    assert.equal(await page.locator('.step:not(.collapsed)').count(),1);
    assert.equal(await page.locator('[data-step-order-id="s1"] .step-drag-handle:visible').count(),0);
    await drag('s1','s3','.step-toggle');assert.deepEqual(await order(),['s0','s1','s2','s3','s4']);
    await drag('s0','s2');assert.deepEqual(await order(),['s1','s2','s0','s3','s4']);
    assert.equal(await page.locator('[data-step-order-id="s1"]:not(.collapsed)').count(),1);
    await page.locator('[data-edit-step="s0"]').click();assert.equal(await page.evaluate(()=>lastAction),'edit');
    await page.locator('[data-del-step="s0"]').click();assert.equal(await page.evaluate(()=>lastAction),'delete');
    await page.reload();assert.deepEqual(await order(),['s1','s2','s0','s3','s4']);
    await page.locator('[data-step-order-id="s0"] .step-drag-handle').press('ArrowUp');await settled();
    assert.deepEqual(await order(),['s1','s0','s2','s3','s4']);
    await page.evaluate(()=>fail=true);await drag('s0','s4');
    assert.deepEqual(await order(),['s1','s0','s2','s3','s4']);
    assert.equal(await page.evaluate(()=>alerts.length),1);
    await page.evaluate(()=>{fail=false;syncing=true;});await drag('s0','s4');
    assert.deepEqual(await order(),['s1','s0','s2','s3','s4']);
    await page.evaluate(()=>syncing=false);
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'plan-step-order-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'plan-step-order-mobile.png'),fullPage:true});
    await page.evaluate(()=>{allowed=false;draw();});
    assert.equal(await page.locator('.step-drag-handle').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: drag up/down, collapsed-only, expanded state, edit/delete, persistence, keyboard, rollback, busy state, permissions, desktop/mobile layout; no page errors.');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
