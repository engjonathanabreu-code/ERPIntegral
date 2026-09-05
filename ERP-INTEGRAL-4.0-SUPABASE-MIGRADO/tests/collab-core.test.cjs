const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../public/erp-collab-core.js');
test('quinzenas respeitam fevereiro bissexto e segunda metade do mês',()=>{
 assert.equal(C.period('2028-02-20','quinzenal').days.length,14);
 assert.equal(C.period('2026-02-20','quinzenal').end,'2026-02-28');
 assert.equal(C.period('2026-01-15','quinzenal').end,'2026-01-15');
 assert.equal(C.move('2026-01-16','quinzenal',-1),'2026-01-15');
 assert.equal(C.move('2026-12-30','quinzenal',1),'2027-01-01');
});
test('mês e trimestre navegam entre anos sem perder dias',()=>{
 assert.equal(C.period('2026-08-31','trimestral').start,'2026-07-01');
 assert.equal(C.period('2026-08-31','trimestral').end,'2026-09-30');
 assert.equal(C.move('2026-10-20','trimestral',1),'2027-01-01');
 assert.equal(C.period('2028-02-29','mensal').days.length,29);
});
test('evento contínuo ocupa todos os dias, com fim exclusivo à meia-noite',()=>{
 const ev={inicio:'2026-09-04T09:00:00-03:00',fim:'2026-09-07T00:00:00-03:00',status:'ativo'};
 assert.equal(C.eventOnDay(ev,'2026-09-03'),false);
 for(const d of ['04','05','06'])assert.equal(C.eventOnDay(ev,`2026-09-${d}`),true);
 assert.equal(C.eventOnDay(ev,'2026-09-07'),false);
 assert.equal(C.eventOnDay({...ev,status:'cancelado'},'2026-09-05'),false);
});
test('prazo inclui o último dia e exclui dias seguintes',()=>{
 const ev={inicio:'2026-09-01',fim:'2026-09-05'};
 assert.equal(C.deadlineOnDay(ev,'2026-09-05'),true);
 assert.equal(C.deadlineOnDay(ev,'2026-09-06'),false);
});

