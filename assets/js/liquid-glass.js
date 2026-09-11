(() => {
  const page = document.querySelector('body.glass-ui');
  if (!page) return;
  const selector = 'a.entry-panel,a.section-card,a.topic-card,a.back-link,button,.main-nav a';
  const fineMotion = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  let active = null;
  let frame = null;
  let pointerX = 0;
  let pointerY = 0;

  const reset = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    active?.style.removeProperty('--glass-x');
    active?.style.removeProperty('--glass-y');
    active = null;
  };

  const paint = () => {
    frame = null;
    if (!active || !fineMotion.matches || document.hidden) return;
    const bounds = active.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(0, Math.min(100, (pointerX - bounds.left) / bounds.width * 100));
    const y = Math.max(0, Math.min(100, (pointerY - bounds.top) / bounds.height * 100));
    active.style.setProperty('--glass-x', x.toFixed(1) + '%');
    active.style.setProperty('--glass-y', y.toFixed(1) + '%');
  };

  const track = event => {
    if (!fineMotion.matches || event.pointerType === 'touch') return;
    const control = event.target.closest?.(selector);
    if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
    if (active !== control) {
      reset();
      active = control;
    }
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (frame === null) frame = window.requestAnimationFrame(paint);
  };

  page.addEventListener('pointermove', track, { passive:true });
  page.addEventListener('pointerover', track, { passive:true });
  page.addEventListener('pointerout', event => {
    if (active && !(event.relatedTarget instanceof Node && active.contains(event.relatedTarget))) reset();
  }, { passive:true });
  page.addEventListener('pointerleave', reset, { passive:true });
  page.addEventListener('pointercancel', reset, { passive:true });
  window.addEventListener('blur', reset);
  fineMotion.addEventListener('change', reset);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  });
})();
