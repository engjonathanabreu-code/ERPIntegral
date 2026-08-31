/* ERP Integral — disposição dos cards na aba Metas.
   Títulos curtos ocupam meia coluna; títulos longos ocupam a coluna inteira. */
(() => {
  'use strict';

  const LONG_TITLE_MIN = 34;
  let scheduled = false;

  function normalizeCards(root = document) {
    root.querySelectorAll('.metas2-board .metas-board-col .metas2-card').forEach(card => {
      const title = (card.querySelector('.metas2-card-top strong')?.textContent || '').trim();
      card.classList.toggle('metas2-card-wide', title.length >= LONG_TITLE_MIN);
      card.classList.toggle('metas2-card-half', title.length < LONG_TITLE_MIN);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      normalizeCards();
    });
  }

  window.addEventListener('load', schedule, { once: true });
  document.addEventListener('click', () => setTimeout(schedule, 0), true);

  const app = document.querySelector('#app');
  if (app) {
    new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  }

  schedule();
})();
