(() => {
  'use strict';
  const images = [...document.querySelectorAll('.photography-gallery .theme-photo img')];
  if (!images.length || typeof HTMLDialogElement === 'undefined') return;

  const dialog = document.createElement('dialog');
  dialog.className = 'photo-lightbox';
  dialog.setAttribute('aria-label', 'Photo preview');

  const frame = document.createElement('div');
  frame.className = 'photo-lightbox-frame';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'photo-lightbox-close';
  closeBtn.setAttribute('aria-label', 'Close preview');
  closeBtn.textContent = '×';

  const figure = document.createElement('figure');
  figure.className = 'photo-lightbox-figure';

  const fullImg = document.createElement('img');
  fullImg.className = 'photo-lightbox-img';
  fullImg.decoding = 'async';

  const caption = document.createElement('figcaption');
  caption.className = 'photo-lightbox-caption';

  figure.append(fullImg, caption);
  frame.append(closeBtn, figure);
  dialog.append(frame);
  document.body.append(dialog);

  let opener = null;
  const openLightbox = img => {
    opener = img;
    fullImg.src = img.currentSrc || img.src;
    fullImg.alt = img.alt || '';
    caption.textContent = img.alt || '';
    caption.hidden = !img.alt;
    if (!dialog.open) dialog.showModal();
    closeBtn.focus();
  };

  const closeLightbox = () => {
    if (dialog.open) dialog.close();
  };

  closeBtn.addEventListener('click', closeLightbox);
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeLightbox();
  });
  dialog.addEventListener('close', () => {
    if (opener && typeof opener.focus === 'function') opener.focus();
    opener = null;
  });

  for (const img of images) {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.classList.add('theme-photo-zoomable');
    img.addEventListener('click', () => openLightbox(img));
    img.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLightbox(img);
      }
    });
  }
})();
