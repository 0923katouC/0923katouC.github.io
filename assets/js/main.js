document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const button = document.querySelector('.lang-switch');
  if (!button) return;

  let lang = 'zh';
  try {
    const saved = localStorage.getItem('site-lang');
    if (saved === 'zh' || saved === 'en') lang = saved;
  } catch {
    // Storage may be unavailable; the language switch still works in memory.
  }

  const apply = () => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-zh][data-en]').forEach(element => {
      element.textContent = element.dataset[lang];
    });
    button.textContent = lang === 'zh' ? 'EN' : '中';
  };

  button.addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    apply();
    try {
      localStorage.setItem('site-lang', lang);
    } catch {
      // A persistence failure must not prevent the current page from switching.
    }
  });

  apply();
});
