export function StatCard({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-[18px] p-4 md:px-8 md:py-7 ${dark ? "bg-night-card" : "border border-line bg-white"}`}
    >
      <p
        className={`text-xs md:text-base ${dark ? "text-gray-400" : "text-muted"}`}
      >
        {label}
      </p>
      <strong className="mt-3 block text-2xl font-bold tabular-nums md:text-[40px]">
        {value}
      </strong>
    </div>
  );
}
