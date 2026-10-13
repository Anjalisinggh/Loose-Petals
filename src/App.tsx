import { useCallback, useEffect, useRef, useState } from 'react';
import { Garden } from './garden/Garden';
import { G_DEFAULT } from './physics/world';
import { MAX_LETTERS } from './garden/lettering';
import { Controls } from './ui/Controls';
import { Footer } from './ui/Footer';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * React only owns the chrome. The garden runs its own frame loop against the canvas and
 * reports back through a single callback, so animation never causes a re-render.
 */
export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gardenRef = useRef<Garden | null>(null);
  const [reduced] = useState(prefersReducedMotion);
  const defaultWind = reduced ? 0.08 : 0.35;

  const [wind, setWind] = useState(defaultWind);
  const [gravity, setGravity] = useState(G_DEFAULT);
  const [gusts, setGusts] = useState(false);
  const [count, setCount] = useState(0);
  const [text, setText] = useState('');
  const [night, setNight] = useState(false);
  const typeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const garden = new Garden(canvasRef.current!, { reducedMotion: reduced, onCount: setCount });
    gardenRef.current = garden;
    garden.start();
    // Development only: lets a recording script drive the garden frame by frame.
    if (import.meta.env.DEV) (window as unknown as { __garden?: Garden }).__garden = garden;
    return () => {
      garden.destroy();
      gardenRef.current = null;
    };
  }, [reduced]);

  useEffect(() => gardenRef.current?.setWind(wind), [wind]);
  useEffect(() => gardenRef.current?.setGravity(gravity), [gravity]);
  useEffect(() => gardenRef.current?.setGusts(gusts), [gusts]);
  useEffect(() => gardenRef.current?.setText(text), [text]);
  useEffect(() => gardenRef.current?.setNight(night), [night]);

  const storm = useCallback(() => gardenRef.current?.petalStorm(), []);
  const save = useCallback(() => void gardenRef.current?.savePNG(), []);
  const reset = useCallback(() => {
    setWind(defaultWind);
    setGravity(G_DEFAULT);
    setGusts(false);
    setText('');
    gardenRef.current?.reset();
  }, [defaultWind]);

  // Typing anywhere writes into a hidden field, so IME, paste and phone keyboards all work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const field = typeRef.current;
      if (!field || e.target === field) return;
      if (e.key === 'Escape') setText('');
      else if (e.key.length === 1 || e.key === 'Backspace') field.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="stage" data-night={night}>
      <canvas ref={canvasRef} aria-label="An interactive garden of flowers you can drag, bend and grow" />

      <header className="ui tl">
        <h1 className="wordmark">Loose Petals</h1>
        <p className="subtitle">A little world of unreasonable nature.</p>
      </header>

      <Controls
        wind={wind}
        gravity={gravity}
        gusts={gusts}
        night={night}
        onNight={setNight}
        onWind={setWind}
        onGravity={setGravity}
        onGusts={setGusts}
        onStorm={storm}
        onReset={reset}
      />

      <input
        ref={typeRef}
        className="typing"
        type="text"
        value={text}
        maxLength={MAX_LETTERS}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setText('')}
        aria-label="Type a word for flowers to grow from"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
      />

      <p className="ui bl hints">
        {gusts ? 'move to blow · click to grow · ' : 'drag to bend · release to bounce · click to grow · '}
        <button type="button" onClick={() => typeRef.current?.focus({ preventScroll: true })}>
          type to plant words
        </button>
      </p>

      <Footer count={count} onSave={save} />
    </main>
  );
}
