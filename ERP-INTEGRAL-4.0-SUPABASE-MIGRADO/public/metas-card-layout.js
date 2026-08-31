/* ERP Integral — disposição e ordenação dos cards na aba Metas.
   Títulos curtos ocupam meia coluna, títulos longos a largura inteira.
   Cards de meia largura são compactados em pares e a ordem escolhida por
   arrastar é persistida em metas.ordem_coluna. */
(() => {
  'use strict';

  const LONG_TITLE_MIN = 34;
  const COL_SELECTOR = '.metas2-board .metas-board-col';
  const CARD_SELECTOR = '.metas2-card[data-meta-card]';
  let scheduled = false;
  let dragging = null;
  let dragJustEndedUntil = 0;
  const initializedSignature = new WeakMap();

  const sb = () => window.ERPIntegralBridge?.sb || null;
  const cardsOf = col => Array.from(col.querySelectorAll(CARD_SELECTOR));

  function classifyCard(card) {
    const title = (card.querySelector('.metas2-card-top strong')?.textContent || '').trim();
    const wide = title.length >= LONG_TITLE_MIN;
    card.classList.toggle('metas2-card-wide', wide);
    card.classList.toggle('metas2-card-half', !wide);
    card.setAttribute('draggable', 'true');
    card.title = 'Arraste para reorganizar esta meta dentro da coluna';
  }

  function normalizeCards(root = document) {
    root.querySelectorAll(`${COL_SELECTOR} ${CARD_SELECTOR}`).forEach(classifyCard);
  }

  async function restoreSavedOrder(col) {
    const cards = cardsOf(col);
    if (cards.length < 2) return;
    const ids = cards.map(c => c.dataset.metaCard).filter(Boolean);
    const signature = ids.slice().sort().join('|');
    if (initializedSignature.get(col) === signature) return;
    initializedSignature.set(col, signature);

    const client = sb();
    if (!client) return;
    const { data, error } = await client.from('metas').select('id,ordem_coluna').in('id', ids);
    if (error || !data) {
      if (error) console.warn('Metas: não foi possível carregar a ordem dos cards.', error);
      return;
    }

    const currentIndex = new Map(cards.map((card, i) => [card.dataset.metaCard, i]));
    const order = new Map(data.map(row => [String(row.id), Number.isFinite(row.ordem_coluna) ? row.ordem_coluna : null]));
    cards.sort((a, b) => {
      const av = order.get(a.dataset.metaCard);
      const bv = order.get(b.dataset.metaCard);
      if (av == null && bv == null) return currentIndex.get(a.dataset.metaCard) - currentIndex.get(b.dataset.metaCard);
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv || currentIndex.get(a.dataset.metaCard) - currentIndex.get(b.dataset.metaCard);
    });
    cards.forEach(card => col.appendChild(card));
  }

  async function persistColumnOrder(col) {
    const client = sb();
    if (!client) return;
    const cards = cardsOf(col);
    const updates = cards.map((card, index) =>
      client.from('metas').update({ ordem_coluna: (index + 1) * 10 }).eq('id', card.dataset.metaCard)
    );
    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);
    if (failed?.error) console.warn('Metas: não foi possível salvar a ordem dos cards.', failed.error);
  }

  function cardAfterPointer(col, y, draggedCard) {
    const candidates = cardsOf(col).filter(card => card !== draggedCard);
    let closest = { offset: Number.NEGATIVE_INFINITY, card: null };
    for (const card of candidates) {
      const box = card.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) closest = { offset, card };
    }
    return closest.card;
  }

  function installDnD(col) {
    if (col.dataset.metaDnDReady === '1') return;
    col.dataset.metaDnDReady = '1';

    col.addEventListener('dragstart', event => {
      const card = event.target.closest?.(CARD_SELECTOR);
      if (!card || card.closest(COL_SELECTOR) !== col) return;
      dragging = card;
      card.classList.add('metas2-card-dragging');
      col.classList.add('metas-board-col-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', card.dataset.metaCard || '');
      }
    });

    col.addEventListener('dragover', event => {
      if (!dragging || dragging.closest(COL_SELECTOR) !== col) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const before = cardAfterPointer(col, event.clientY, dragging);
      if (before) col.insertBefore(dragging, before);
      else col.appendChild(dragging);
    });

    col.addEventListener('drop', event => {
      if (!dragging || dragging.closest(COL_SELECTOR) !== col) return;
      event.preventDefault();
      persistColumnOrder(col);
    });

    col.addEventListener('dragend', () => {
      if (!dragging) return;
      const activeCol = dragging.closest(COL_SELECTOR);
      dragging.classList.remove('metas2-card-dragging');
      activeCol?.classList.remove('metas-board-col-dragging');
      if (activeCol) persistColumnOrder(activeCol);
      dragging = null;
      dragJustEndedUntil = Date.now() + 350;
    });
  }

  async function initializeBoard(root = document) {
    normalizeCards(root);
    const columns = Array.from(root.querySelectorAll(COL_SELECTOR));
    columns.forEach(installDnD);
    await Promise.all(columns.map(restoreSavedOrder));
    normalizeCards(root);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      initializeBoard().catch(err => console.warn('Metas: falha ao preparar organização dos cards.', err));
    });
  }

  document.addEventListener('click', event => {
    if (Date.now() < dragJustEndedUntil && event.target.closest?.(CARD_SELECTOR)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    setTimeout(schedule, 0);
  }, true);

  window.addEventListener('load', schedule, { once: true });
  const app = document.querySelector('#app');
  if (app) new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
