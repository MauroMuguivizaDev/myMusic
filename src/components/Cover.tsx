import { useEffect, useState, type CSSProperties } from 'react';
import { AudioLines } from 'lucide-react';
export function Cover({ title, artwork, animateChange = false }: { title?: string; artwork?: string; animateChange?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [transition, setTransition] = useState<{ source?: string; visible?: string; loaded?: string }>({ source: artwork });

  useEffect(() => {
    if (!animateChange || transition.source === artwork) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setFailed(null);
      setTransition(previous => artwork ? { source: artwork, visible: previous.visible } : {});
    });
    return () => { active = false; };
  }, [artwork, animateChange, transition.source]);

  useEffect(() => {
    if (!animateChange || !artwork || transition.loaded !== artwork || transition.visible === artwork) return;
    const timer = window.setTimeout(() => {
      setTransition({ source: artwork, visible: artwork });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [animateChange, artwork, transition.loaded, transition.visible]);

  const hue = title ? [...title].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360 : 215;
  if (!animateChange) return <div className={`cover ${artwork && failed !== artwork ? 'has-artwork' : 'cover-generated'}`} style={{ '--hue': hue } as CSSProperties} aria-hidden="true">
    {artwork && failed !== artwork ? <img src={artwork} alt="" loading="lazy" decoding="async" onError={() => setFailed(artwork)} /> : <><span className="cover-orbit" /><span className="cover-orbit second" /><AudioLines strokeWidth={1.2} /></>}
  </div>;

  const visibleArtwork = artwork && transition.source ? transition.visible : undefined;
  const pendingArtwork = artwork && artwork !== visibleArtwork && failed !== artwork ? artwork : undefined;
  const hasVisibleArtwork = Boolean(visibleArtwork && failed !== visibleArtwork);
  return <div className={`cover ${hasVisibleArtwork ? 'has-artwork' : 'cover-generated'}`} style={{ '--hue': hue } as CSSProperties} aria-hidden="true">
    {!hasVisibleArtwork && <><span className="cover-orbit" /><span className="cover-orbit second" /><AudioLines strokeWidth={1.2} /></>}
    {hasVisibleArtwork && <img className="cover-image" src={visibleArtwork} alt="" decoding="async" />}
    {pendingArtwork && <img
      key={pendingArtwork}
      className={`cover-image cover-image-incoming${transition.loaded === pendingArtwork ? ' is-ready' : ''}`}
      src={pendingArtwork}
      alt=""
      decoding="async"
      onLoad={() => setTransition(previous => ({ ...previous, loaded: pendingArtwork }))}
      onError={() => { setFailed(pendingArtwork); setTransition({ source: artwork }); }}
    />}
  </div>;
}
