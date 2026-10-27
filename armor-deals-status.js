(() => {
  'use strict';
  function active(now = Date.now()) {
    const config = window.ARMOR_DEALS || {};
    const start = Date.parse(config.startsAt), end = Date.parse(config.endsAt);
    return config.enabled === true && Number.isFinite(start) && Number.isFinite(end)
      && end > start && now >= start && now < end;
  }
  window.armorDealsActive = active;
  let previous = active();
  function refresh() {
    const on = active();
    if (on && !previous && document.documentElement.classList.contains('armor-deals-page')) {
      location.reload();return;
    }
    previous = on;
    document.documentElement.classList.toggle('armor-deals-inactive', !on);
    const tile = document.querySelector('.am-promo-deals');
    if (tile) {
      if (on) {
        tile.href = 'deals.html';
        tile.removeAttribute('aria-disabled');
        tile.removeAttribute('tabindex');
      } else {
        tile.removeAttribute('href');
        tile.setAttribute('role', 'link');
        tile.setAttribute('aria-disabled', 'true');
        tile.setAttribute('tabindex', '-1');
      }
      tile.querySelector('.am-kicker').textContent = on ? 'OPORTUNIDADES ARMOR' : 'VOLVEREMOS CON MÁS';
      tile.querySelector('p').textContent = on ? 'Una selección de ofertas para descubrir.' : 'Estamos preparando nuevas promociones.';
      tile.querySelector('.am-cta').textContent = on ? 'Explorar ofertas ↗' : 'Próximamente';
    }
    const notice = document.getElementById('armor-deals-paused');
    if (notice) notice.hidden = on;
    const section = document.getElementById('deals');
    // Keep the original countdown and this guard on the same campaign dates.
    if (section && !on) section.hidden = true;
  }
  refresh();
  document.addEventListener('DOMContentLoaded', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pageshow', refresh);
  setInterval(refresh, 1000);
  // Check again at click time, even if the tab was sleeping at expiration.
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if ((link.matches('.am-promo-deals') || /(^|\/)deals\.html(?:[?#]|$)/.test(href)) && !active()) {
      event.preventDefault();event.stopImmediatePropagation();refresh();
    }
  }, true);
})();
