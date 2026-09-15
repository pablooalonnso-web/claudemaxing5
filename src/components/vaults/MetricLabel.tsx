"use client";

import { Eye } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Metric caption with an accessible hover / click tooltip rendered into <body>. */
export function MetricLabel({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const close = () => {
    cancel();
    timer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => cancel, []);
  useLayoutEffect(() => {
    if (!open) return void setPos(null);
    const place = () => {
      if (!button.current || !tip.current) return;
      const b = button.current.getBoundingClientRect();
      const t = tip.current.getBoundingClientRect();
      const left = Math.max(12, Math.min(b.right - t.width, window.innerWidth - t.width - 12));
      const below = b.bottom + 8;
      setPos({ left, top: below + t.height <= window.innerHeight - 12 ? below : Math.max(12, b.top - t.height - 8) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, children]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancel();
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !tip.current?.contains(t)) {
        cancel();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <div className="vault-metric-label">
      <span>{label}</span>
      <button
        ref={button}
        type="button"
        className="vault-metric-info"
        aria-label={`About ${label.toLowerCase()}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") {
            cancel();
            setOpen(true);
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") close();
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) {
            cancel();
            setOpen(true);
          }
        }}
        onBlur={close}
        onClick={() => {
          cancel();
          setOpen((v) => !v);
        }}
      >
        <Eye size={15} strokeWidth={1.6} aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <div id={id} ref={tip} role="tooltip" className="vault-metric-tooltip" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }} onPointerEnter={cancel} onPointerLeave={close}>
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
