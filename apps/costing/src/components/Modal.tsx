"use client";

import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** When false, overlay click / Escape / close button are disabled. */
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!dismissible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dismissible]);

  return (
    <div className="overlay" onClick={dismissible ? onClose : undefined}>
      <div
        className={wide ? "modal modal-wide" : "modal"}
        role="dialog"
        aria-modal
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          {dismissible ? (
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              ✕
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
