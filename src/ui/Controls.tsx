import { memo } from 'react';
import { G_DEFAULT } from '../physics/world';

interface Props {
  wind: number;
  gravity: number;
  gusts: boolean;
  onWind(v: number): void;
  onGravity(v: number): void;
  onGusts(v: boolean): void;
  onStorm(): void;
  onReset(): void;
}

function gravityLabel(g: number) {
  if (Math.abs(g) < 0.03) return 'weightless';
  return `${g > 0 ? '↓' : '↑'} ${Math.abs(g).toFixed(2)}`;
}

export const Controls = memo(function Controls(p: Props) {
  return (
    <section className="ui tr panel" aria-label="Garden controls">
      <div className="row">
        <label htmlFor="wind">Wind</label>
        <input
          id="wind"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={p.wind}
          onChange={(e) => p.onWind(Number(e.target.value))}
          aria-valuetext={`${Math.round(p.wind * 100)} percent`}
        />
        <button
          type="button"
          className="chip"
          aria-pressed={p.gusts}
          onClick={() => p.onGusts(!p.gusts)}
          title="Let the cursor blow gusts through the garden"
        >
          gusts
        </button>
      </div>

      <div className="row">
        <label htmlFor="gravity">Gravity</label>
        <input
          id="gravity"
          className="centred"
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={p.gravity}
          onChange={(e) => p.onGravity(Number(e.target.value))}
          onDoubleClick={() => p.onGravity(G_DEFAULT)}
          aria-valuetext={gravityLabel(p.gravity)}
          title="Left floats, right falls. Double-click to restore."
        />
        <output htmlFor="gravity">{gravityLabel(p.gravity)}</output>
      </div>

      <div className="row actions">
        <button type="button" className="link" onClick={p.onStorm} title="Tear the petals loose and whirl them around">
          Petal storm
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className="link" onClick={p.onReset} title="Restore the original garden">
          Reset
        </button>
      </div>
    </section>
  );
});
