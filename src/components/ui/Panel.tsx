import styles from "./Panel.module.css";

interface PanelProps {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

export function Panel({ title, description, className, children }: PanelProps) {
  return (
    <section className={[styles.panel, className].filter(Boolean).join(" ")}>
      {(title || description) && (
        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {description && <p className={styles.description}>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
