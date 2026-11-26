(() => {
  try {
    if (localStorage.getItem('site-lang') === 'en') {
      document.documentElement.dataset.lang = 'en';
      document.documentElement.lang = 'en';
    }
  } catch {
    // Storage access may be restricted; main.js handles fallback safely.
  }
})();
