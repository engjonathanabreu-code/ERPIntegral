(function(root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const day = value => new Date(`${value}T12:00:00`);
  function period(anchor, mode) {
    const d = day(anchor);
    let start, end;
    if (mode === 'quinzenal') {
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate() <= 15 ? 1 : 16, 12);
      end = new Date(d.getFullYear(), d.getMonth(), d.getDate() <= 15 ? 15 : new Date(d.getFullYear(),d.getMonth()+1,0).getDate(),12);
    } else {
      const month = mode === 'trimestral' ? Math.floor(d.getMonth()/3)*3 : d.getMonth();
      start = new Date(d.getFullYear(),month,1,12);
      end = new Date(d.getFullYear(),month+(mode === 'trimestral' ? 3 : 1),0,12);
    }
    const days = [];
    for (let x = new Date(start); x <= end; x.setDate(x.getDate()+1)) days.push(dateKey(x));
    return {start:dateKey(start),end:dateKey(end),days};
  }
  function move(anchor, mode, direction) {
    const p = period(anchor,mode), d = day(direction > 0 ? p.end : p.start);
    d.setDate(d.getDate()+direction);
    return dateKey(d);
  }
  function eventOnDay(event, key) {
    const start = new Date(`${key}T00:00:00-03:00`);
    const end = new Date(start.getTime()+86400000);
    return event.status === 'ativo' && new Date(event.inicio) < end && new Date(event.fim) > start;
  }
  function deadlineOnDay(event, key) {return !!event.fim && key >= (event.inicio || event.fim) && key <= event.fim;}
  function color(key) {
    let hash=0; for (const c of key) hash=(hash*31+c.charCodeAt(0))|0;
    return `hsl(${Math.abs(hash)%360} 60% 37%)`;
  }
  const api={dateKey,period,move,eventOnDay,deadlineOnDay,color};
  if(typeof module !== 'undefined') module.exports=api;
  else root.ERPCollabCore=api;
})(typeof window !== 'undefined' ? window : globalThis);

