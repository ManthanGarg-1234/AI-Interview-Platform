import { useState } from "react";
import { X } from "lucide-react";

const buttonVariants = {
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 focus-visible:ring-indigo-500",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-indigo-500",
  ghost: "text-slate-700 hover:bg-slate-100 focus-visible:ring-indigo-500",
  danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500",
};

export function Button({ as: Element = "button", variant = "primary", className = "", ...props }) {
  return <Element className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50 ${buttonVariants[variant] || buttonVariants.primary} ${className}`} {...props} />;
}

export function Input({ label, className = "", ...props }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-slate-700">{label}<input className={`min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${className}`} {...props} /></label>;
}

export function Select({ label, className = "", children, ...props }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-slate-700">{label}<select className={`min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${className}`} {...props}>{children}</select></label>;
}

export function Textarea({ label, className = "", ...props }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-slate-700">{label}<textarea className={`min-h-28 rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${className}`} {...props} /></label>;
}

export function Card({ className = "", ...props }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`} {...props} />;
}

const badgeVariants = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-indigo-50 text-indigo-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
};

export function Badge({ variant = "neutral", className = "", ...props }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${badgeVariants[variant] || badgeVariants.neutral} ${className}`} {...props} />;
}

export function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><h2 id="modal-title" className="text-lg font-bold text-slate-950">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  );
}

export function Dropdown({ label, children }) {
  return <details className="relative"><summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">{label}</summary><div className="absolute right-0 z-20 mt-2 min-w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">{children}</div></details>;
}

export function Tooltip({ label, children }) {
  return <span className="group relative inline-flex" title={label}>{children}<span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">{label}</span></span>;
}

export function Tabs({ items, value, onChange, label = "Options" }) {
  const selected = value ?? items[0]?.value;
  return <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{items.map((item) => <button key={item.value} type="button" role="tab" aria-selected={selected === item.value} onClick={() => onChange?.(item.value)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${selected === item.value ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{item.label}</button>)}</div>;
}

export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

export function Loader({ label = "Loading" }) {
  return <div role="status" className="inline-flex items-center gap-2 text-sm text-slate-500"><span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />{label}</div>;
}

export function EmptyState({ title, description, action }) {
  return <div className="grid justify-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="font-bold text-slate-900">{title}</h2>{description && <p className="mt-2 max-w-md text-sm text-slate-600">{description}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", onConfirm, onCancel, pending = false }) {
  const [confirming, setConfirming] = useState(false);
  const busy = pending || confirming;
  async function confirm() {
    if (!onConfirm) return;
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }
  return <Modal open={open} title={title} onClose={onCancel}><p className="text-sm leading-6 text-slate-600">{description}</p><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button variant="danger" onClick={confirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</Button></div></Modal>;
}
