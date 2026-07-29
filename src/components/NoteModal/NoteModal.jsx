import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, TextArea, showToast } from "@ui";
import { MAX_NOTE_IMAGE_MB } from "@utils/api";
import { isImageFile, isTextFile } from "@utils/file";
import styles from "./note.module.css";

const MAX_IMAGE_BYTES = MAX_NOTE_IMAGE_MB * 1024 * 1024;

// A dropped text file is read straight into the writing area, so the cap is
// about keeping that area usable rather than anything the server enforces.
const MAX_TEXT_MB = 1;
const MAX_TEXT_BYTES = MAX_TEXT_MB * 1024 * 1024;

// Starting height of the writing area, and the floor its resize handle honors.
// Kept in step with .textArea's min-height.
const NOTE_HEIGHT = 260;

// Writes a new note: free text whose first line becomes the card title, plus
// one optional attached image. `initialFile` is a file the note is opening with
// — one dropped on the page rather than picked in here. `onSave` gets
// { text, image, imageName }; image is a data: URL, which is how the server
// takes it, and imageName the file it came from.
export default function NoteModal({ isOpen, initialFile = null, onClose, onSave }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imageName, setImageName] = useState("");
  const [saving, setSaving] = useState(false);
  const textRef = useRef(null);
  const fileRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setText("");
    setImage(null);
    setImageName("");
    setSaving(false);
    requestAnimationFrame(() => textRef.current?.focus());
  }, [isOpen]);

  // The one path every file takes, however it arrives — picked with the button,
  // dropped on the modal, or dropped on the page before the modal even opened.
  // An image becomes the attachment; a text file is read into the writing area.
  const acceptFile = useCallback(
    (file) => {
      if (!file) return;

      if (isTextFile(file)) {
        if (file.size > MAX_TEXT_BYTES) {
          showToast(t("app.textTooLarge", { max: MAX_TEXT_MB }));
          return;
        }
        const reader = new FileReader();
        // Appended rather than assigned, so dropping a file never wipes out
        // something already typed. With an empty area it just loads the text.
        reader.onload = () => {
          const loaded = String(reader.result);
          setText((prev) => (prev.trim() ? `${prev}\n${loaded}` : loaded));
        };
        reader.onerror = () => showToast(t("app.invalidFile"));
        reader.readAsText(file);
        return;
      }

      if (!isImageFile(file)) {
        showToast(t("app.invalidFile"));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showToast(t("app.imageTooLarge", { max: MAX_NOTE_IMAGE_MB }));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setImage(String(reader.result));
        setImageName(file.name);
      };
      reader.onerror = () => showToast(t("app.invalidImage"));
      reader.readAsDataURL(file);
    },
    [t],
  );

  function pickImage(e) {
    const file = e.target.files?.[0];
    // Let the same file be picked again after being removed
    e.target.value = "";
    acceptFile(file);
  }

  // An image the note opened with (dropped on the page) goes through the same
  // checks as a picked one. Declared after the reset above so it wins on open,
  // and re-runs if another image is dropped while the modal is already up.
  useEffect(() => {
    if (isOpen && initialFile) acceptFile(initialFile);
  }, [isOpen, initialFile, acceptFile]);

  // The drop target is the whole dialog — title bar included — rather than just
  // the attach button, so the listeners go on the modal box itself instead of
  // anything this component renders. dragover has to be prevented for a drop to
  // fire at all, and the drop too: a file dropped on a textarea otherwise gets
  // handled by the browser, which navigates away from the app.
  useEffect(() => {
    const dialog = formRef.current?.closest('[role="dialog"]');
    if (!isOpen || !dialog) return;
    const dragged = (e) => e.dataTransfer?.types?.includes("Files");
    const onDragOver = (e) => {
      if (!dragged(e)) return;
      e.preventDefault();
      dialog.dataset.dragging = "true";
    };
    // Crossing into a child fires dragleave on the ancestor; ignore those
    const onDragLeave = (e) => {
      if (!dialog.contains(e.relatedTarget)) delete dialog.dataset.dragging;
    };
    const onDrop = (e) => {
      delete dialog.dataset.dragging;
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      acceptFile(e.dataTransfer.files[0]);
    };
    dialog.addEventListener("dragover", onDragOver);
    dialog.addEventListener("dragleave", onDragLeave);
    dialog.addEventListener("drop", onDrop);
    return () => {
      dialog.removeEventListener("dragover", onDragOver);
      dialog.removeEventListener("dragleave", onDragLeave);
      dialog.removeEventListener("drop", onDrop);
    };
  }, [isOpen, acceptFile]);

  // An image on its own is enough; only a blank note with no image is nothing.
  const empty = !text.trim() && !image;

  async function save() {
    if (saving) return;
    if (empty) {
      showToast(t("app.noteEmpty"));
      textRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      await onSave({ text, image, imageName });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("app.newNote")} className={styles.modal}>
      <div className={styles.form} ref={formRef}>
        <TextArea
          ref={textRef}
          className={styles.textArea}
          value={text}
          minHeight={NOTE_HEIGHT}
          onChange={(e) => setText(e.target.value)}
        />

        <div className={styles.imageRow}>
          <input ref={fileRef} type="file" accept="image/*" className={styles.file} onChange={pickImage} />
          <button type="button" className={styles.uploadBtn} onClick={() => fileRef.current?.click()}>
            {t("app.attachImage")}
          </button>
          {imageName && <span className={styles.imageName}>{imageName}</span>}
        </div>

        {image && (
          <div className={styles.previewWrap}>
            <img src={image} alt={imageName} className={styles.preview} />
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => {
                setImage(null);
                setImageName("");
              }}
              aria-label={t("app.removeImage")}
              title={t("app.removeImage")}
            >
              ✕
            </button>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.saveBtn} disabled={saving || empty} onClick={save}>
            {t("app.stash")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
