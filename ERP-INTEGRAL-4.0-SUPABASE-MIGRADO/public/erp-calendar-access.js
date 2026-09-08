(() => {
  'use strict';
  const bridge = window.ERPIntegralBridge;
  const sb = bridge?.sb;
  if (!sb || sb.__erpCalendarAccessPatched) return;

  const originalFrom = sb.from.bind(sb);
  const isManager = () => {
    const type = window.ERPCoreNavigation?.currentUser?.type || bridge.currentUser?.type || '';
    return ['Administrador', 'Diretor de Projetos', 'Diretor de Projeto'].includes(type);
  };
  const currentUserId = () => window.ERPCoreNavigation?.currentUser?.id || bridge.currentUser?.id || null;

  sb.from = function(relation) {
    const query = originalFrom(relation);
    if (relation !== 'erp_eventos' || !query?.select) return query;

    const originalSelect = query.select.bind(query);
    query.select = function(...selectArgs) {
      const builder = originalSelect(...selectArgs);
      if (!builder?.range) return builder;

      const originalRange = builder.range.bind(builder);
      builder.range = function(...rangeArgs) {
        const result = originalRange(...rangeArgs);
        if (!result?.then) return result;

        const originalThen = result.then.bind(result);
        result.then = function(onFulfilled, onRejected) {
          return originalThen(response => {
            const uid = currentUserId();
            if (!isManager() && uid && Array.isArray(response?.data)) {
              response = {
                ...response,
                data: response.data.map(event => {
                  if (!event?.agenda_id || (event.participantes || []).includes(uid)) return event;
                  return { ...event, participantes: [...(event.participantes || []), uid] };
                })
              };
            }
            return onFulfilled ? onFulfilled(response) : response;
          }, onRejected);
        };
        return result;
      };
      return builder;
    };
    return query;
  };

  sb.__erpCalendarAccessPatched = true;
})();
