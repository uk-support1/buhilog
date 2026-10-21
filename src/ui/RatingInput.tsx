interface Props {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}

/** 0〜10 の選択。未入力(null)は 0 とは別に選べる。 */
export function RatingInput({ label, value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label={label} className="rating">
      {Array.from({ length: 11 }, (_, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          className={value === i ? 'sel' : ''}
          onClick={() => onChange(i)}
        >
          {i}
        </button>
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={value == null}
        className={`skip ${value == null ? 'sel' : ''}`}
        onClick={() => onChange(null)}
      >
        未入力
      </button>
    </div>
  );
}
