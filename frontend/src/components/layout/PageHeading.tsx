export function PageHeading({
  title,
  description,
  centered = false,
}: {
  title: string;
  description?: string;
  centered?: boolean;
}) {
  return (
    <div className={`space-y-4 ${centered ? "text-center" : ""}`}>
      <h1 className="whitespace-pre-line text-3xl leading-[1.35] font-bold tracking-tight md:text-[38px]">
        {title}
      </h1>
      {description && (
        <p className="whitespace-pre-line text-base leading-relaxed text-muted md:text-[17px]">
          {description}
        </p>
      )}
    </div>
  );
}
