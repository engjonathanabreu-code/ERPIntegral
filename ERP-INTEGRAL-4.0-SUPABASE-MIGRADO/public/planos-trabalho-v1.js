/* ERP Integral - Planos de Trabalho V1
   Visão inicial compacta por plano + detalhe completo ao clicar.
   Preserva o HTML e os eventos originais gerados por app.js. */
(() => {
  'use strict';

  let openPlanKey = null;
  let scheduled = false;
  let applying = false;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function text(el) {
    return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isPlansScreen() {
    const title = $('#title');
    return !!title && text(title).toLowerCase() === 'planos de trabalho' && !!$('#content');
  }

  function getPlanKey(card, index) {
    return card.querySelector('[data-edit-plan]')?.dataset.editPlan ||
      card.querySelector('[data-plan]')?.dataset.plan ||
      `plan-index-${index}`;
  }

  function stepStatus(step) {
    const select = step.querySelector('[data-step-status]');
    if (select) return String(select.value || '').trim();

    const statusLabels = $$('.badge', step).map(text).filter(Boolean);
    const known = ['Pendente', 'Em andamento', 'Aguardando', 'Concluída', 'Bloqueada'];
    return statusLabels.find(v => known.includes(v)) || '';
  }

  function stepInfo(step) {
    const title = text(step.querySelector('.step-title')) || 'Etapa sem título';
    const status = stepStatus(step) || 'Pendente';
    const boxes = $$('.info-box', step);
    const prazo = boxes.find(x => /^Prazo/i.test(text(x)))?.textContent?.replace(/^\s*Prazo\s*/i, '').trim() || '—';
    const responsaveis = boxes.find(x => /^Responsáveis/i.test(text(x)))?.textContent?.replace(/^\s*Responsáveis\s*/i, '').trim() || 'Sem responsáveis';
    return { title, status, prazo, responsaveis };
  }

  function lastOpenStep(card) {
    const steps = $$('.step', card);
    const open = steps.filter(step => stepStatus(step) !== 'Concluída');
    if (!open.length) return null;
    return stepInfo(open[open.length - 1]);
  }

  function planMeta(card) {
    const name = text(card.querySelector('.plan-head h3')) || 'Plano de trabalho';
    const badges = $$('.plan-head .badge', card).map(text).filter(Boolean);
    const project = badges[0] || 'Sem projeto';
    const planStatus = badges[1] || '';
    const progress = badges.find(v => /%/.test(v)) || '';
    return { name, project, planStatus, progress };
  }

  function createSummary(card, key) {
    let summary = card.querySelector(':scope > .plans-mini-summary');
    if (!summary) {
      summary = document.createElement('button');
      summary.type = 'button';
      summary.className = 'plans-mini-summary';
      summary.addEventListener('click', () => {
        openPlanKey = key;
        applyPlansView();
      });
      card.prepend(summary);
    }

    const meta = planMeta(card);
    const open = lastOpenStep(card);
    const stageHtml = open
      ? `<div class="plans-mini-current"><span class="plans-mini-label">Última etapa em aberto</span><strong>${escapeHtml(open.title)}</strong><span>${escapeHtml(open.status)}${open.prazo && open.prazo !== '—' ? ` • Prazo ${escapeHtml(open.prazo)}` : ''}</span></div>`
      : `<div class="plans-mini-current plans-mini-current-done"><span class="plans-mini-label">Etapas</span><strong>Nenhuma etapa em aberto</strong><span>O plano não possui pendências nas etapas cadastradas.</span></div>`;

    summary.innerHTML = `
      <div class="plans-mini-main">
        <strong class="plans-mini-title">${escapeHtml(meta.name)}</strong>
        <span class="plans-mini-project">${escapeHtml(meta.project)}</span>
      </div>
      ${stageHtml}
      <div class="plans-mini-side">
        ${meta.planStatus ? `<span class="badge ${meta.planStatus === 'Concluído' ? 'ok' : ''}">${escapeHtml(meta.planStatus)}</span>` : ''}
        ${meta.progress ? `<span class="plans-mini-progress">${escapeHtml(meta.progress)}</span>` : ''}
        <span class="plans-mini-open">Abrir plano →</span>
      </div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function ensureDetailBar(card, key) {
    let bar = card.querySelector(':scope > .plans-detail-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'plans-detail-bar';
      bar.innerHTML = '<button type="button" class="btn secondary small plans-back-button">← Voltar aos planos</button>';
      bar.querySelector('.plans-back-button').addEventListener('click', () => {
        openPlanKey = null;
        applyPlansView();
      });
      card.prepend(bar);
    }
    bar.dataset.planKey = key;
  }

  function applyPlansView() {
    if (applying || !isPlansScreen()) return;
    applying = true;
    try {
      const content = $('#content');
      const cards = $$('.plan-card', content);
      if (!cards.length) return;

      content.classList.add('plans-index-enabled');

      const keyed = cards.map((card, index) => {
        const key = getPlanKey(card, index);
        card.dataset.plansKey = key;
        createSummary(card, key);
        return { card, key };
      });

      if (openPlanKey && !keyed.some(x => x.key === openPlanKey)) openPlanKey = null;

      keyed.forEach(({ card, key }) => {
        const summary = card.querySelector(':scope > .plans-mini-summary');
        const detailBar = card.querySelector(':scope > .plans-detail-bar');

        if (openPlanKey) {
          const active = key === openPlanKey;
          card.classList.toggle('plans-detail-card', active);
          card.classList.remove('plans-summary-card');
          card.hidden = !active;
          if (summary) summary.hidden = true;
          if (active) {
            ensureDetailBar(card, key);
            const activeBar = card.querySelector(':scope > .plans-detail-bar');
            if (activeBar) activeBar.hidden = false;
          } else if (detailBar) detailBar.hidden = true;
        } else {
          card.hidden = false;
          card.classList.add('plans-summary-card');
          card.classList.remove('plans-detail-card');
          if (summary) summary.hidden = false;
          if (detailBar) detailBar.hidden = true;
        }
      });

      const toolbar = content.querySelector(':scope > .toolbar');
      if (toolbar) toolbar.classList.toggle('plans-toolbar-detail', !!openPlanKey);
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!isPlansScreen()) {
        openPlanKey = null;
        return;
      }
      applyPlansView();
    });
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-view]');
    if (nav && nav.dataset.view !== 'plans') openPlanKey = null;
  }, true);

  window.addEventListener('load', scheduleApply);
  scheduleApply();
})();
