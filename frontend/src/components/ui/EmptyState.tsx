import type { ReactNode } from "react";
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-24 text-center text-muted">{children}</div>;
}
