import { useEffect } from 'react';

export function useFormViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const update = () => {
      if (Math.abs(viewport.scale - 1) > .01) return;
      const root = document.documentElement;
      root.style.setProperty('--visual-height', `${viewport.height}px`);
      root.style.setProperty('--visual-top', `${viewport.offsetTop}px`);
      const keyboard = window.innerHeight - viewport.height > 150 && viewport.scale === 1;
      root.dataset.keyboard = keyboard ? 'open' : 'closed';
      const focused = document.activeElement;
      if (keyboard && focused instanceof HTMLElement && focused.matches('input,select,textarea') && focused.closest('dialog')) {
        focused.scrollIntoView({ block: 'nearest' });
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      document.documentElement.style.removeProperty('--visual-height');
      document.documentElement.style.removeProperty('--visual-top');
      delete document.documentElement.dataset.keyboard;
    };
  }, []);
}
