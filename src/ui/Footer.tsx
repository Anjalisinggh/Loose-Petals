import { memo } from 'react';

interface Props {
  count: number;
  onSave(): void;
}

export const Footer = memo(function Footer({ count, onSave }: Props) {
  return (
    <footer className="ui br">
      <span className="counter" aria-live="polite">
        <b>{String(count).padStart(2, '0')}</b> {count === 1 ? 'flower' : 'flowers'}
      </span>
      <button type="button" className="chip" onClick={onSave} title="Save the composition as a PNG">
        Save PNG
      </button>
    </footer>
  );
});
