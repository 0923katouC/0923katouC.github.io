(() => {
  const page = document.querySelector('body.home-page');
  const header = page?.querySelector('.site-header');
  const footer = page?.querySelector('.site-footer');
  if (!header || !footer) return;

  let frame = null;
  const updateEdges = () => {
    frame = null;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? window.innerHeight;
    const bottom = top + height;
    const clampHeight = value => Math.max(0, Math.min(height, value));
    const headerBottom = header.getBoundingClientRect().bottom;
    const footerTop = footer.getBoundingClientRect().top;

    page.style.setProperty('--home-viewport-top', top + 'px');
    page.style.setProperty('--home-viewport-bottom', (window.innerHeight - bottom) + 'px');
    page.style.setProperty('--home-top-glass', clampHeight(headerBottom - top) + 'px');
    page.style.setProperty('--home-bottom-glass', clampHeight(bottom - footerTop) + 'px');
    page.classList.add('home-edges-ready');
  };
  const scheduleUpdate = () => {
    if (frame === null) frame = window.requestAnimationFrame(updateEdges);
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('pageshow', scheduleUpdate);
  window.visualViewport?.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleUpdate);
  if ('ResizeObserver' in window) {
    const observer = new window.ResizeObserver(scheduleUpdate);
    observer.observe(header);
    observer.observe(footer);
    observer.observe(page);
  }
  document.fonts?.ready.then(scheduleUpdate);
  updateEdges();
})();
