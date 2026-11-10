export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label ? <span className="visually-hidden">{label}</span> : null}
    </span>
  );
}
