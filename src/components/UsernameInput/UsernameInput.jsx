// A contenteditable stand-in for <input> so password managers (iCloud
// Passwords etc.) never attach their autofill UI — they only target real
// input elements. Uncontrolled: the parent receives text via onChange.
export default function UsernameInput({ className, placeholder, ariaLabel, onChange, onSubmit }) {
  return (
    <div
      className={className}
      contentEditable="plaintext-only"
      role="textbox"
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      enterKeyHint="go"
      onInput={(e) => onChange(e.currentTarget.textContent)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!e.nativeEvent.isComposing) onSubmit();
        }
      }}
    />
  );
}
