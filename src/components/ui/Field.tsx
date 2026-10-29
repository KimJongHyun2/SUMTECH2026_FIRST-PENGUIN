import styles from "./Field.module.css";

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

/** 라벨 글자가 E2E의 찾는 기준이라 label 문자열은 scenarios.yaml과 같게 둔다 */
export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={styles.control} {...props} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={styles.control} {...props} />;
}
