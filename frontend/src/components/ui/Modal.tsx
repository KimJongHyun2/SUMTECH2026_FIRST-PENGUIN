import { useEffect, useId, useRef, type ReactNode } from "react";
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={onClose}
      onClose={onClose}
      className="fixed inset-0 m-auto w-[min(680px,92vw)] rounded-3xl border border-line bg-white p-6 text-ink shadow-2xl md:p-12"
    >
      <h2 id={id} className="text-center text-2xl font-bold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
