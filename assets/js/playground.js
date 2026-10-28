// Progressive enhancement: every catalogue card remains a normal link without JS.
(() => {
  const button = document.getElementById('pick-something');
  const links = [...document.querySelectorAll('a[data-play-card]')];
  if (!button || !links.length) return;
  button.hidden = false;
  button.addEventListener('click', () => {
    let random = Math.random();
    try { const n = new Uint32Array(1); crypto.getRandomValues(n); random = n[0] / 4294967296; } catch { /* Local randomness is enough for picking a toy. */ }
    const target = new URL(links[Math.floor(random * links.length)].href, location.href);
    if (target.origin === location.origin) location.assign(target.href);
  });
})();
