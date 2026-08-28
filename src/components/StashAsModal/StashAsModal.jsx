import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, TextArea } from "@ui";
import { STORE_KEYS, WRITE_STORES } from "@utils/api";
import styles from "./stashas.module.css";

// Starting height of the note field, and the floor its resize handle honors.
// Kept in step with .noteArea's min-height.
const NOTE_HEIGHT = 60;

// The store picker behind an Option-click on a Stash button: the same item,
// filed on a shelf of the user's choosing rather than the one analysis picked,
// with a note to file alongside it. Notes are left out for an analyzed result —
// an authored store is only written through its own endpoint — but stay in for
// a copy, which carries the whole record (its original author included) across
// as-is.
export default function StashAsModal({ isOpen, item, allowWrite = false, onClose, onSelect }) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState(null);

  // The modal opens on the store the item already belongs to — the shelf a plain
  // click would have used — so Save without touching the list files it exactly
  // where it would have gone. The field opens on the note the item is already
  // carrying: a copy comes over with the one its author wrote, a freshly
  // analyzed result with nothing.
  useEffect(() => {
    if (!isOpen) return;
    setNote(item?.note || "");
    const own = item?.store;
    setSelected(own && (allowWrite || !WRITE_STORES.has(own)) ? own : null);
  }, [isOpen, item, allowWrite]);

  if (!item) return null;

  const stores = allowWrite ? STORE_KEYS : STORE_KEYS.filter((s) => !WRITE_STORES.has(s));

  function save() {
    if (selected) onSelect(selected, note);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={save}
      title={t("app.stashAs")}
      closeOnOverlay
      className={styles.modal}
    >
      <div className={styles.body}>
        <div className={styles.list} role="listbox" aria-label={t("app.stashAs")}>
          {stores.map((store) => (
            <button
              key={store}
              type="button"
              role="option"
              aria-selected={store === selected}
              className={styles.store}
              onClick={() => setSelected(store)}
            >
              {t(`app.storeNames.${store}`)}
              {store === item.store && <span className={styles.default}>{t("app.stashAsDefault")}</span>}
            </button>
          ))}
        </div>
        <div className={styles.noteField}>
          <label className={styles.label}>{t("app.note")}</label>
          <TextArea
            className={styles.noteArea}
            value={note}
            minHeight={NOTE_HEIGHT}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.saveBtn} disabled={!selected} onClick={save}>
            {t("button.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
