(() => {
  'use strict';
  const page = document.querySelector('body.ui-page');
  if (!page) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Map();
  const controls = 'a.entry-panel,a.section-card,a.topic-card,a.back-link,.main-nav a,button';
  const blocks = 'main .home-intro,main .page-head,main .entry-panel,main .section-card,main .topic-card,main .archive-block,main .placeholder-block,main .gate-card,main .portal-card,main .academic-overview > .academic-section,main .pub';
  const settle = 'cubic-bezier(.2,.75,.3,1)';
  let observer = null;
  let entered = false;
  let suspended = false;

  const cancel = element => {
    running.get(element)?.cancel();
    running.delete(element);
  };
  const animate = (element, frames, options) => {
    if (motion.matches || !element?.animate || document.hidden || suspended) return;
    cancel(element);
    const animation = element.animate(frames, { ...options, fill:'backwards' });
    running.set(element, animation);
    const clean = () => {
      if (running.get(element) === animation) running.delete(element);
    };
    animation.finished.then(clean, clean);
  };
  const reset = () => {
    observer?.disconnect();
    observer = null;
    for (const animation of running.values()) animation.cancel();
    running.clear();
  };

  // Squash, overshoot, then two smaller settlements. Individual transforms
  // compose with the existing glass hover transform instead of replacing it.
  const pop = (element, delay = 0, kind = 'card') => {
    const button = kind === 'button';
    const heading = kind === 'heading';
    const start = button ? '.72 .82' : heading ? '.96' : '.87 .91';
    const peak = button ? '1.075 1.045' : heading ? '1.014' : '1.035 1.045';
    const distance = button ? '0 14px' : heading ? '0 18px' : '0 30px';
    animate(element, [
      { opacity:0, scale:start, translate:distance, offset:0, easing:settle },
      { opacity:1, scale:peak, translate:heading ? '0 -3px' : '0 -7px', offset:.48, easing:'ease-in-out' },
      { opacity:1, scale:button ? '.965 .98' : '.988 .982', translate:'0 2px', offset:.72, easing:'ease-in-out' },
      { opacity:1, scale:'1.009 1.012', translate:'0 -1px', offset:.88, easing:'ease-in-out' },
      { opacity:1, scale:'1', translate:'0 0', offset:1 }
    ], { duration:button ? 520 : heading ? 560 : 620, delay, easing:'linear' });
  };

  const revealBlock = (element, delay) => {
    pop(element, delay, element.matches('.home-intro,.page-head') ? 'heading' : 'card');
    // Back/read/download buttons get a later, smaller beat inside their panel.
    element.querySelectorAll('a.back-link,button').forEach((button, i) => {
      pop(button, delay + 110 + i * 45, 'button');
    });
  };
  const enter = () => {
    if (entered || suspended || motion.matches || document.hidden) return;
    entered = true;
    if (!page.animate) return;
    document.documentElement.classList.add('motion-reveal');
    const modules = [...page.querySelectorAll(blocks)]
      .filter(element => !element.parentElement.closest(blocks));
    let visibleIndex = 0;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        let index = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer?.unobserve(entry.target);
          revealBlock(entry.target, index++ * 65);
        }
      }, { rootMargin:'0px 0px 24px 0px', threshold:0 });
    }
    for (const element of modules) {
      const bounds = element.getBoundingClientRect();
      if (bounds.bottom > 0 && bounds.top < window.innerHeight) {
        revealBlock(element, Math.min(visibleIndex++ * 75, 300));
      } else if (observer) {
        observer.observe(element);
      }
    }
    // On a fresh visit all nav pills pop in; during site navigation only the
    // selected pill responds, keeping the rest of the navigation easy to use.
    let internal = false;
    try { internal = new URL(document.referrer).origin === window.location.origin; } catch {}
    page.querySelectorAll(internal ? '.main-nav a.active' : '.main-nav a,.lang-switch')
      .forEach((button, i) => pop(button, 35 + i * 40, 'button'));
  };

  const controlFor = event => {
    const control = event.target.closest?.(controls);
    return control && !control.disabled && control.getAttribute('aria-disabled') !== 'true' ? control : null;
  };
  // A new press takes over immediately, even while an entrance/rebound runs.
  page.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const control = controlFor(event);
    if (control) cancel(control);
  }, { passive:true });
  page.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const control = controlFor(event);
    if (control) cancel(control);
  });
  page.addEventListener('focusin', event => {
    const block = event.target.closest?.(blocks);
    if (block) cancel(block);
    const control = controlFor(event);
    if (control) cancel(control);
  });
  page.addEventListener('click', event => {
    const control = controlFor(event);
    if (!control || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const card = control.matches('.entry-panel,.section-card,.topic-card');
    animate(control, [
      { scale:card ? '.94 .92' : '.89 .86', offset:0, easing:settle },
      { scale:card ? '1.035 1.045' : '1.085 1.06', offset:.4, easing:'ease-in-out' },
      { scale:'.975 .985', offset:.68, easing:'ease-in-out' },
      { scale:'1.012 1.008', offset:.86, easing:'ease-in-out' },
      { scale:'1', offset:1 }
    ], { duration:card ? 560 : 500, easing:'linear' });
  });

  // pagereveal starts the new document's live content animations at its first
  // rendered frame, including underneath a native View Transition snapshot.
  if ('onpagereveal' in window) window.addEventListener('pagereveal', enter);
  else enter();
  window.addEventListener('pagehide', () => { suspended = true; reset(); });
  window.addEventListener('pageshow', event => {
    suspended = false;
    // Preserve restored scroll/focus; do not replay the entry on Back/Forward.
    if (event.persisted) entered = true;
  });
  motion.addEventListener('change', () => {
    reset();
    if (motion.matches) entered = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
    else enter();
  });
})();
