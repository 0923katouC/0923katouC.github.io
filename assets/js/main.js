document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('.lang-switch');
  if (!button) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Map();
  const stopAnimations = () => {
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
  };
  motion.addEventListener('change', stopAnimations);
  window.addEventListener('pagehide', stopAnimations);

  let lang = 'zh';
  try {
    const saved = localStorage.getItem('site-lang');
    if (saved === 'zh' || saved === 'en') lang = saved;
  } catch {
    // Storage may be unavailable; the language switch still works in memory.
  }

  const apply = (animated = false) => {
    stopAnimations();
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-zh][data-en]').forEach(element => {
      const changed = element.textContent !== element.dataset[lang];
      element.textContent = element.dataset[lang];
      if (animated && changed && !motion.matches && element.animate) {
        const animation = element.animate([{ opacity:.25 }, { opacity:1 }], {
          duration:180, easing:'ease-out'
        });
        animations.set(element, animation);
        const clean = () => {
          if (animations.get(element) === animation) animations.delete(element);
        };
        animation.finished.then(clean, clean);
      }
    });
    button.textContent = lang === 'zh' ? 'EN' : '中';
  };

  button.addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    apply(true);
    try {
      localStorage.setItem('site-lang', lang);
    } catch {
      // A persistence failure must not prevent the current page from switching.
    }
  });

  apply();
});
