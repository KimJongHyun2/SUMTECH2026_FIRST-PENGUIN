import Link from "next/link";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm";

function classes(variant: Variant, size: Size, block: boolean, extra?: string) {
  return [styles.button, styles[variant], styles[size], block && styles.block, extra].filter(Boolean).join(" ");
}

interface CommonProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  type = "button",
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={classes(variant, size, block, className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  block = false,
  className,
  ...rest
}: CommonProps & React.ComponentProps<typeof Link>) {
  return <Link className={classes(variant, size, block, className)} {...rest} />;
}
