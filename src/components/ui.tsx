import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  AlertCircle,
  Inbox,
  RefreshCw,
  X,
  Check,
  Copy,
} from "lucide-react";
import { useState } from "react";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className={"brand " + (compact ? "compact" : "")}
      aria-label="Setl8 home"
    >
      <img src="/setl8-logo.png" alt="" width="64" height="64" />
      {!compact && (
        <span>
          SETL8<span className="brand-dot">®</span>
        </span>
      )}
    </Link>
  );
}
export function Button({
  variant = "secondary",
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "blue" | "rose" | "green" | "amber";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  children,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: typeof Inbox;
}) {
  return (
    <div className="empty">
      <Icon size={28} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>Couldn’t load this view</strong>
        <p>{message}</p>
      </div>
      {retry && (
        <Button onClick={retry}>
          <RefreshCw size={14} />
          Try again
        </Button>
      )}
    </div>
  );
}
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="skeletons"
      role="status"
      aria-label="Loading recorded account data"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
export function ExternalArrow() {
  return <ArrowUpRight size={16} aria-hidden="true" />;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        if (previous instanceof HTMLElement && previous.isConnected)
          previous.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <Button variant="ghost" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function CopyValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      className="copy-value"
      aria-label={label || "Copy account ID"}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      <span>{copied ? "Copied" : label || "Copy"}</span>
    </Button>
  );
}
export function JsonDetails({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <details className="json-details">
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function tabKeys(event: import("react").KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  );
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next]?.focus();
  tabs[next]?.click();
}
