import { useMemo, useState } from 'react';

export interface ChipOption {
  value: string;
  label: string;
}

interface ChipSelectProps {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  /** Fuerza el buscador. Por defecto se activa solo si hay más de 8 opciones. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Muestra una caja "vacío/todos" al principio. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  emptyValue?: string;
}

/**
 * Selector de cajas (chips) que sustituye a <select>. Single-select.
 * Listas largas: buscador encima que filtra las cajas (elección de Cipry:
 * "todos a cajas, con buscador en listas largas").
 */
export default function ChipSelect({
  options,
  value,
  onChange,
  searchable,
  searchPlaceholder,
  allowEmpty = false,
  emptyLabel = '—',
  emptyValue = '',
}: ChipSelectProps) {
  const [q, setQ] = useState('');
  const showSearch = searchable ?? options.length > 8;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(o => o.label.toLowerCase().includes(s));
  }, [options, q]);

  return (
    <div>
      {showSearch && (
        <input
          className="form-input chip-search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={searchPlaceholder ?? 'Buscar…'}
        />
      )}
      <div className="chip-group" role="radiogroup">
        {allowEmpty && (
          <button
            type="button"
            role="radio"
            aria-checked={value === emptyValue}
            className={`chip ${value === emptyValue ? 'is-active' : ''}`}
            onClick={() => onChange(emptyValue)}
          >
            {emptyLabel}
          </button>
        )}
        {filtered.map(o => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`chip ${value === o.value ? 'is-active' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
        {showSearch && filtered.length === 0 && (
          <span className="chip-empty">Sin resultados</span>
        )}
      </div>
    </div>
  );
}
