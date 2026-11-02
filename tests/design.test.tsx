import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Cover } from '../src/components/Cover';
import { imageData, isSuitableArtwork } from '../src/services/artwork';
import { readTheme } from '../src/domain/themes';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('apresenta a capa real e recupera com o placeholder se a imagem falhar', () => {
  const { container, rerender } = render(<Cover title="Song" artwork="data:image/png;base64,AA==" />);
  const image = container.querySelector('img')!;
  expect(image.src).toContain('data:image/png');
  fireEvent.error(image);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('.cover-generated')).not.toBeNull();
  rerender(<Cover title="Song" artwork="data:image/png;base64,BB==" />);
  expect(container.querySelector('img')?.src).toContain('BB==');
});
it('mantém a capa anterior até carregar a nova e faz uma transição breve', async () => {
  vi.useFakeTimers();
  const { container, rerender } = render(<Cover title="First" artwork="data:image/png;base64,AA==" animateChange />);
  const first = container.querySelector('.cover-image-incoming')!;
  fireEvent.load(first);
  await act(async () => { vi.advanceTimersByTime(180); });
  expect(container.querySelector('.cover-image')?.getAttribute('src')).toContain('AA==');

  rerender(<Cover title="Second" artwork="data:image/png;base64,BB==" animateChange />);
  expect(container.querySelector('.cover-image')?.getAttribute('src')).toContain('AA==');
  const next = container.querySelector('.cover-image-incoming')!;
  fireEvent.load(next);
  expect(container.querySelector('.cover-image')?.getAttribute('src')).toContain('AA==');
  await act(async () => { vi.advanceTimersByTime(180); });
  expect(container.querySelector('.cover-image')?.getAttribute('src')).toContain('BB==');
});
it('mantém as capas decorativas fora do nome acessível dos controlos', () => {
  render(<button aria-label="Reproduzir Song"><Cover title="Song" /></button>);
  expect(screen.getByRole('button', { name:'Reproduzir Song' })).toBeDefined();
});
it('rejeita ficheiros de capa inválidos ou demasiado grandes', async () => {
  await expect(imageData(new File(['not-an-image'],'bad.svg',{type:'image/svg+xml'}))).rejects.toThrow('JPEG');
  const file = new File(['large'],'image.png',{type:'image/png'});
  Object.defineProperty(file,'size',{value:9 * 1024 * 1024});
  await expect(imageData(file)).rejects.toThrow('8 MB');
});
it('rejeita capas remotas pequenas ou com proporção inadequada', () => {
  expect(isSuitableArtwork(120, 120)).toBe(false);
  expect(isSuitableArtwork(500, 500)).toBe(true);
  expect(isSuitableArtwork(800, 400)).toBe(false);
  expect(isSuitableArtwork(400, 800)).toBe(false);
});
it('preserva preferências antigas e valida o novo fundo opcional', () => {
  const previous = { id:'custom',background:'#101b1a',accent:'#a2e5d3' };
  localStorage.setItem('my-music-theme',JSON.stringify(previous));
  expect(readTheme()).toMatchObject(previous);
  localStorage.setItem('my-music-theme',JSON.stringify({...previous,backgroundImage:'url(javascript:bad)'}));
  expect(readTheme().backgroundImage).toBeUndefined();
  localStorage.setItem('my-music-theme',JSON.stringify({...previous,backgroundImage:'data:image/jpeg;base64,AA=='}));
  expect(readTheme().backgroundImage).toBe('data:image/jpeg;base64,AA==');
});
