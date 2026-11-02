import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
export function Modal({ label, close, children, full = false, header }: { label: string; close: () => void; children: ReactNode; full?: boolean; header?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const dialog = ref.current;
    const focused = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; if (focused instanceof HTMLElement) focused.focus(); };
  }, []);
  return <motion.dialog ref={ref} initial={reduced ? false : { opacity: 0, y: full ? 48 : 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : full ? 48 : 20 }} transition={{ duration: reduced ? 0 : .22, ease: [.22, .68, .2, 1] }} className={full ? 'advanced-modal full-player' : 'advanced-modal'} aria-label={label} onCancel={event => { event.preventDefault(); close(); }}>
    <header className="panel-header">{header ?? <><h2>{label}</h2><button className="button secondary" onClick={close}>Fechar</button></>}</header>{children}
  </motion.dialog>;
}
