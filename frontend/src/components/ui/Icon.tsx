export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <img
      src={`/design/${name}.svg`}
      alt=""
      className={`shrink-0 max-w-none ${className}`}
    />
  );
}
