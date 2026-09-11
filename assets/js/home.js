(() => {
  const page = document.querySelector('body.home-page');
  const header = page?.querySelector('.site-header');
  const footer = page?.querySelector('.site-footer');
  if (!header || !footer) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const limit = 12;
  let stretch = 0;
  let velocity = 0;
  let target = 0;
  let frame = null;
  let previousTime = 0;
  let lastInput = -Infinity;
  let lastDirectInput = -Infinity;
  let lastScrollY = window.scrollY;
  let touchY = null;
  let headerSpace = 0;
  let footerSpace = 0;

  // Actual bar sizes own the glass, border and centered content together.
  const paint = () => {
    page.style.setProperty('--home-header-stretch', stretch.toFixed(3) + 'px');
    page.style.setProperty('--home-footer-stretch', (-stretch * 0.75).toFixed(3) + 'px');
  };
  const measureSpaces = () => {
    // Reserve resting sizes so the spring never changes the document scroll range.
    const top = header.getBoundingClientRect().height - stretch;
    const bottom = footer.getBoundingClientRect().height + stretch * 0.75;
    if (Math.abs(top - headerSpace) > 0.5) {
      headerSpace = top;
      page.style.setProperty('--home-header-space', top.toFixed(2) + 'px');
    }
    if (Math.abs(bottom - footerSpace) > 0.5) {
      footerSpace = bottom;
      page.style.setProperty('--home-footer-space', bottom.toFixed(2) + 'px');
    }
  };
  const reset = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    stretch = velocity = target = 0;
    paint();
  };
  const animate = now => {
    const elapsed = Math.max(0, Math.min((now - previousTime) / 1000, 0.05));
    previousTime = now;
    if (now - lastInput > 90) target = 0;
    // Short integration steps keep the same damped spring stable at different frame rates.
    const steps = Math.max(1, Math.ceil(elapsed * 120));
    const dt = elapsed / steps;
    for (let i = 0; i < steps; i++) {
      velocity += (240 * (target - stretch) - 27 * velocity) * dt;
      stretch += velocity * dt;
      if (Math.abs(stretch) > limit) {
        stretch = Math.sign(stretch) * limit;
        velocity = 0;
      }
    }
    if (target === 0 && Math.abs(stretch) < 0.015 && Math.abs(velocity) < 0.08) {
      reset();
      return;
    }
    paint();
    frame = window.requestAnimationFrame(animate);
  };
  const respond = delta => {
    if (motion.matches || !Number.isFinite(delta) || delta === 0) return;
    target = -Math.sign(delta) * Math.min(limit, 1.5 + Math.abs(delta) * 0.18);
    lastInput = window.performance.now();
    if (frame === null) {
      previousTime = lastInput;
      frame = window.requestAnimationFrame(animate);
    }
  };

  window.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    lastDirectInput = window.performance.now();
    respond(event.deltaY * unit);
  }, { passive: true });

  window.addEventListener('touchstart', event => {
    touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }, { passive: true });
  window.addEventListener('touchmove', event => {
    if (event.touches.length !== 1) {
      touchY = null;
      return;
    }
    const y = event.touches[0].clientY;
    if (touchY !== null) {
      lastDirectInput = window.performance.now();
      respond(touchY - y);
    }
    touchY = y;
  }, { passive: true });
  const endTouch = () => { touchY = null; };
  window.addEventListener('touchend', endTouch, { passive: true });
  window.addEventListener('touchcancel', endTouch, { passive: true });

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    // Wheel/touch already supplied this motion; scroll also supports keyboard and scrollbar input.
    if (window.performance.now() - lastDirectInput > 120) respond(y - lastScrollY);
    lastScrollY = y;
  }, { passive: true });
  window.addEventListener('resize', measureSpaces);
  window.addEventListener('pageshow', measureSpaces);
  window.visualViewport?.addEventListener('resize', measureSpaces);
  if ('ResizeObserver' in window) {
    const observer = new window.ResizeObserver(measureSpaces);
    observer.observe(header);
    observer.observe(footer);
  }
  motion.addEventListener('change', () => {
    if (motion.matches) reset();
    measureSpaces();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  });
  document.fonts?.ready.then(measureSpaces);
  paint();
  measureSpaces();
})();
