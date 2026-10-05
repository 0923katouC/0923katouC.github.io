(() => {
  'use strict';
  const page = document.querySelector('body.ui-page');
  if (!page) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Map();
  const animate = (element, frames, options) => {
    if (motion.matches || !element?.animate) return;
    running.get(element)?.cancel();
    const animation = element.animate(frames, options);
    running.set(element, animation);
    const clean = () => {
      if (running.get(element) === animation) running.delete(element);
    };
    animation.finished.then(clean, clean);
  };
  const reset = () => {
    for (const animation of running.values()) animation.cancel();
    running.clear();
  };

  // A short release response remains visible even after a very quick tap or
  // keyboard activation. Individual scale composes with existing glass tilt.
  page.addEventListener('click', event => {
    const control = event.target.closest?.('a.entry-panel,a.section-card,a.topic-card,a.back-link,.main-nav a,button');
    if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
    if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    animate(control, [{ scale:'.985' }, { scale:'1.004', offset:.65 }, { scale:'1' }], {
      duration:220, easing:'cubic-bezier(.22,1,.36,1)'
    });
  });

  // Older browsers still get a quiet arrival, without intercepting navigation.
  if (!('CSSViewTransitionRule' in window)) {
    window.addEventListener('pageshow', event => {
      if (event.persisted) return;
      animate(page.querySelector('main'), [
        { opacity:.4, transform:'translateY(8px)' },
        { opacity:1, transform:'translateY(0)' }
      ], { duration:260, easing:'cubic-bezier(.22,1,.36,1)' });
    });
  }
  motion.addEventListener('change', reset);
  window.addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  });
})();
