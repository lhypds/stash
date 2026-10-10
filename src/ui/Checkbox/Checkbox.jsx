import styles from "./checkbox.module.css";

// A labelled checkbox drawn in the app's own ink rather than the platform's
// control. `children` is the label text; `className` and `title` land on the
// label, everything else on the input itself.
export default function Checkbox({ className, title, children, ...props }) {
  return (
    <label className={`${styles.field}${className ? ` ${className}` : ""}`} title={title}>
      <input type="checkbox" className={styles.box} {...props} />
      {children}
    </label>
  );
}
