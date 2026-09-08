(() => {
  'use strict';

  const bridge = window.ERPIntegralBridge;
  const sb = bridge?.sb;
  if (!sb || window.__erpCalendarFilterFixLoaded) return;
  window.__erpCalendarFilterFixLoaded = true;

  let cache = { users: [], events: [], deadlines: [] };
  let cacheAt = 0;
  let applying = false;
  let queued = false;

  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isManager = () => {
    const type = window.ERPCoreNavigation?.currentUser?.type || bridge.currentUser?.type || '';
    return ['Administrador', 'Diretor de Projetos', 'Diretor de Projeto'].includes(type);
  };

  async function rows(table) {
    const data = [];
    for (let offset = 0;; offset += 1000) {
      const r = await sb.from(table).select('*').range(offset, offset + 999);
      if (r.error) throw r.error;
      data.push(...(r.data || []));
      if (!r.data || r.data.length < 1000) return data;
    }
  }

  async function refreshCache(force = false) {
    if (!force && Date.now() - cacheAt < 15000 && cache.deadlines.length) return;
    const [directory, events, deadlines] = await Promise.all([
      sb.rpc('erp_collab_directory'),
      rows('erp_eventos'),
      rows('erp_prazos')
    ]);
    if (directory.error) throw directory.error;
    cache = { users: directory.data || [], events, deadlines };
    cacheAt = Date.now();
  }

  function selectedUsers() {
    return Array.from(document.querySelectorAll('[data-calendar-user]:checked')).map(input => input.value);
  }

  function participantMatch(item, selected) {
    if (!selected.length) return true;
    const participants = Array.isArray(item?.participantes) ? item.participantes.map(String) : [];
    return selected.some(id => participants.includes(String(id)));
  }

  function userName(id) {
    return cache.users.find(user => String(user.id) === String(id))?.nome || '';
  }

  function itemUserSortKey(item) {
    const names = (item?.participantes || []).map(userName).filter(Boolean);
    names.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    return normalize(names[0] || 'zzzzzz');
  }

  function updateSummary(selected) {
    const summary = document.querySelector('.collab-user-filter > summary');
    if (!summary) return;
    if (!selected.length) {
      summary.textContent = 'Todos os usuários';
      return;
    }
    const names = selected.map(userName).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    summary.textContent = names.length === 1 ? names[0] : `${names.length} usuários selecionados`;
  }

  function sortMetaButtons(day) {
    const buttons = Array.from(day.querySelectorAll('[data-deadline]'));
    const metas = buttons.filter(button => {
      const item = cache.deadlines.find(deadline => deadline.chave === button.dataset.deadline);
      return item?.entidade_tipo === 'meta';
    });
    if (metas.length < 2) return;

    const sorted = metas.slice().sort((a, b) => {
      const da = cache.deadlines.find(deadline => deadline.chave === a.dataset.deadline);
      const db = cache.deadlines.find(deadline => deadline.chave === b.dataset.deadline);
      const byUser = itemUserSortKey(da).localeCompare(itemUserSortKey(db), 'pt-BR', { sensitivity: 'base' });
      if (byUser !== 0) return byUser;
      return String(da?.titulo || '').localeCompare(String(db?.titulo || ''), 'pt-BR', { sensitivity: 'base' });
    });

    const firstMeta = metas[0];
    const marker = document.createComment('meta-order');
    firstMeta.parentNode.insertBefore(marker, firstMeta);
    metas.forEach(button => button.remove());
    sorted.forEach(button => marker.parentNode.insertBefore(button, marker));
    marker.remove();
  }

  async function apply() {
    if (applying || !isManager() || !document.querySelector('.collab-calendar')) return;
    applying = true;
    try {
      await refreshCache();
      const selected = selectedUsers();
      updateSummary(selected);

      document.querySelectorAll('[data-event]').forEach(button => {
        const item = cache.events.find(event => String(event.id) === String(button.dataset.event));
        button.hidden = !!item && !participantMatch(item, selected);
      });

      document.querySelectorAll('[data-deadline]').forEach(button => {
        const item = cache.deadlines.find(deadline => deadline.chave === button.dataset.deadline);
        button.hidden = !!item && !participantMatch(item, selected);
      });

      document.querySelectorAll('.collab-day[data-day]').forEach(sortMetaButtons);
    } catch (error) {
      console.warn('Calendário: não foi possível aplicar filtro complementar.', error);
    } finally {
      applying = false;
    }
  }

  function queueApply(force = false) {
    if (queued) return;
    queued = true;
    requestAnimationFrame(async () => {
      queued = false;
      if (force) cacheAt = 0;
      await apply();
    });
  }

  document.addEventListener('change', event => {
    if (event.target?.matches?.('[data-calendar-user]')) queueApply();
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('#collabRefresh')) queueApply(true);
  });

  new MutationObserver(() => {
    if (document.querySelector('.collab-calendar')) queueApply();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
