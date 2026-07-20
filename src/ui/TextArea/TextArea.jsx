import { useRef, forwardRef } from "react";
import styles from "./textarea.module.css";

const TextArea = forwardRef(function TextArea({ className, minHeight = 80, ...props }, forwardedRef) {
  const localRef = useRef(null);

  function setRefs(el) {
    localRef.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  }

  function onMouseDown(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = localRef.current.offsetHeight;
    function onMouseMove(e) {
      localRef.current.style.height = Math.max(minHeight, startHeight + e.clientY - startY) + "px";
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div className={styles.wrapper}>
      <textarea ref={setRefs} className={`${styles.textarea}${className ? ` ${className}` : ""}`} {...props} />
      <div className={styles.handle} onMouseDown={onMouseDown} />
    </div>
  );
});

export default TextArea;
