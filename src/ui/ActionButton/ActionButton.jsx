import React from "react";
import styles from "./action.module.css";

export default function ActionButton({ tooltip, onClick, children }) {
  const icon = React.Children.only(children);
  return (
    <button type="button" className={styles.actionButton} data-tooltip={tooltip} onClick={onClick}>
      {React.cloneElement(icon, { className: styles.icon })}
    </button>
  );
}
