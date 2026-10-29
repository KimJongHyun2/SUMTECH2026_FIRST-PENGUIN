import type { ButtonHTMLAttributes } from "react";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
  size?: "normal" | "large";
};
export function Button({
  variant = "outline",
  size = "normal",
  className = "",
  type = "button",
  ...props
}: Props) {
  const variants = {
    primary:
      "border-primary bg-primary text-ink hover:bg-primary-strong hover:border-primary-strong",
    outline:
      "border-line bg-transparent hover:border-primary-strong hover:bg-primary-tint hover:text-ink",
    ghost: "border-transparent bg-transparent hover:text-primary-strong",
  };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] border px-6 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${size === "large" ? "min-h-[66px] py-4 text-lg" : "min-h-12 py-3 text-sm"} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
