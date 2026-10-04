(() => {
  'use strict';
  const root = document.querySelector('[data-photography-motion]');
  if (!root) return;

  const clock = root.querySelector('[data-nixie-clock]');
  const rows = [
    { name: 'date', count: 6, initialDelay: 500, update: changeDateHour },
    { name: 'year', count: 4, initialDelay: 250, update: changeYear }
  ].map(row => {
    const group = clock ? clock.querySelector(`[data-nixie-row="${row.name}"]`) : null;
    return {
      ...row,
      digits: group ? [...group.querySelectorAll('[data-nixie-digit]')] : [],
      jitter: group ? group.querySelector('[data-nixie-jitter]') : null,
      timer: null
    };
  }).filter(row => row.digits.length === row.count);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const hasObserver = 'IntersectionObserver' in window;
  let visible = !hasObserver;
  let pageActive = true;

  // Continuous wire numerals match the static SVG; only the lit cathodes change.
  const paths = {
    '0': 'M20 3 C9 3 5 14 5 32 C5 50 9 61 20 61 C31 61 35 50 35 32 C35 14 31 3 20 3 Z',
    '1': 'M10 15 L21 4 L21 60',
    '2': 'M5 17 C5 8 11 3 20 3 C30 3 36 9 35 18 C34 27 26 33 18 41 L5 60 L36 60',
    '3': 'M6 10 C11 4 18 2 25 4 C40 8 37 28 22 31 C38 32 40 53 27 59 C19 63 10 60 5 54',
    '4': 'M29 60 L29 4 L4 43 L37 43',
    '5': 'M34 4 L8 4 L6 29 C13 25 23 25 29 30 C40 42 33 62 19 61 C12 61 7 58 4 53',
    '6': 'M31 7 C14 1 5 16 5 36 C5 52 10 61 21 61 C33 61 38 50 34 40 C29 28 12 28 5 40',
    '7': 'M4 4 L36 4 C24 21 18 36 14 60',
    '8': 'M20 31 C5 27 1 17 8 8 C14 0 27 1 33 10 C39 20 31 28 20 31 C6 35 0 47 9 57 C15 64 28 63 34 54 C40 43 32 35 20 31 Z',
    '9': 'M35 26 C30 37 15 37 8 29 C0 20 6 3 19 3 C31 3 35 15 35 30 C35 49 26 64 10 57'
  };
  // Exclude leap day so independently changing years always form valid dates.
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const hoursPerYear = 365 * 24;
  const pad = value => String(value).padStart(2, '0');
  const canRun = () => pageActive && visible && !document.hidden && !motion.matches;

  function formatDateHour(slot) {
    let day = Math.floor(slot / 24);
    let month = 0;
    while (day >= monthDays[month]) day -= monthDays[month++];
    return `${pad(month + 1)}-${pad(day + 1)} ${pad(slot % 24)}`;
  }

  function paint(row, numerals) {
    for (const digit of row.digits) {
      const value = numerals[Number(digit.dataset.nixieDigit)];
      if (paths[value]) digit.setAttribute('d', paths[value]);
    }
    if (row.jitter) {
      row.jitter.dataset.jolt = row.jitter.dataset.jolt === 'a' ? 'b' : 'a';
    }
  }

  function changeDateHour(row) {
    let slot = Math.floor(Math.random() * hoursPerYear);
    if (formatDateHour(slot) === clock.dataset.dateHour) slot = (slot + 1) % hoursPerYear;
    const dateHour = formatDateHour(slot);
    clock.dataset.dateHour = dateHour;
    paint(row, dateHour.replace(/\D/g, ''));
  }

  function changeYear(row) {
    const firstYear = 2001;
    const count = new Date().getFullYear() - firstYear + 1;
    let year = firstYear + Math.floor(Math.random() * count);
    if (String(year) === clock.dataset.year && count > 1) {
      year = firstYear + (year - firstYear + 1) % count;
    }
    clock.dataset.year = String(year);
    paint(row, String(year));
  }

  function schedule(row, delay) {
    row.timer = setTimeout(() => {
      row.timer = null;
      if (!canRun()) {
        synchronize();
        return;
      }
      row.update(row);
      schedule(row, 500);
    }, delay);
  }

  function synchronize() {
    const running = canRun();
    root.dataset.motionState = running ? 'running' : 'paused';
    for (const row of rows) {
      if (!running) {
        if (row.timer !== null) clearTimeout(row.timer);
        row.timer = null;
        if (row.jitter) delete row.jitter.dataset.jolt;
      } else if (row.timer === null) {
        schedule(row, row.initialDelay);
      }
    }
  }

  if (hasObserver) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target === root) visible = entry.isIntersecting && entry.intersectionRatio > 0;
      }
      synchronize();
    });
    observer.observe(root);
  }
  document.addEventListener('visibilitychange', synchronize);
  motion.addEventListener('change', synchronize);
  addEventListener('pagehide', () => { pageActive = false; synchronize(); });
  addEventListener('pageshow', () => { pageActive = true; synchronize(); });
  synchronize();
})();
