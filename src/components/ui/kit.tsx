"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Icon } from "./icons";
import { SparkArea } from "@/components/charts/small";
import { money, signedPercent } from "@/lib/format";

/* ===================================================================
   Carte
   =================================================================== */

export function Card({
  title,
  action,
  children,
  className = "",
  padded = true,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card anim-rise ${className}`}>
      {title || action ? (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={padded ? "px-4 py-4 sm:px-5" : ""}>{children}</div>
    </section>
  );
}

/* ===================================================================
   Tuile de statistique

   Contrat : libellé · valeur · variation (signée, période nommée) ·
   tendance optionnelle. La couleur de la variation dit la direction,
   jamais toute seule : la flèche et le texte la doublent.
   =================================================================== */

export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  trend,
  trendColor,
  tone = "neutral",
  hint,
  onClick,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  trend?: number[];
  trendColor?: string;
  tone?: "neutral" | "good" | "warning" | "critical";
  hint?: string;
  onClick?: () => void;
}) {
  const Root = onClick ? "button" : "div";
  const toneColor =
    tone === "good"
      ? "var(--good)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "critical"
          ? "var(--critical)"
          : undefined;

  return (
    <Root
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`card anim-rise flex w-full flex-col gap-1.5 p-4 text-left ${
        onClick ? "transition-colors hover:bg-[var(--surface-2)]" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        {toneColor ? (
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor }} />
        ) : null}
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
      </div>
      <span className="text-[22px] font-semibold leading-none tracking-tight sm:text-[25px]">
        {value}
      </span>
      {delta !== undefined && delta !== null ? (
        <Delta ratio={delta} label={deltaLabel} />
      ) : hint ? (
        <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      ) : null}
      {/* La courbe ferme la tuile sur toute sa largeur : à côté du
          chiffre, elle n'avait plus la place de dire quoi que ce soit. */}
      {trend && trend.length > 1 ? (
        <div className="mt-auto pt-2">
          <SparkArea values={trend} color={trendColor ?? "var(--series-1)"} />
        </div>
      ) : null}
    </Root>
  );
}

export function Delta({ ratio, label }: { ratio: number; label?: string }) {
  const up = ratio >= 0;
  const Arrow = up ? Icon.up : Icon.down;
  return (
    <span className="flex items-center gap-1 text-[11.5px]">
      <Arrow size={12} className="shrink-0" />
      <span
        className="tnum font-medium"
        style={{ color: up ? "var(--delta-up)" : "var(--delta-down)" }}
      >
        {signedPercent(ratio)}
      </span>
      {label ? <span style={{ color: "var(--text-muted)" }}>{label}</span> : null}
    </span>
  );
}

/* ===================================================================
   Chiffre de tête — un seul par vue.
   Chiffres proportionnels : à cette taille, `tabular-nums` fait
   flotter les chiffres étroits.
   =================================================================== */

export function Hero({
  label,
  cents,
  children,
}: {
  label: string;
  cents: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span className="text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[56px]">
        {money(cents)}
      </span>
      {children}
    </div>
  );
}

/* ===================================================================
   Contrôles
   =================================================================== */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  label,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 rounded-full p-0.5"
      style={{ background: "var(--surface-2)" }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`rounded-full font-medium transition-all ${
              size === "sm" ? "px-2.5 py-1 text-[11.5px]" : "px-3.5 py-1.5 text-[12.5px]"
            }`}
            style={{
              background: active ? "var(--surface-1)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: active ? "var(--shadow-card)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Button({
  children,
  variant = "ghost",
  size = "md",
  icon,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md";
  icon?: React.ReactNode;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--text-primary)", color: "var(--surface-1)" },
    ghost: { background: "var(--surface-2)", color: "var(--text-primary)" },
    outline: {
      background: "transparent",
      color: "var(--text-primary)",
      border: "1px solid var(--border-strong)",
    },
    danger: { background: "transparent", color: "var(--critical)" },
  };
  return (
    <button
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium transition-all active:scale-[0.97] disabled:opacity-45 ${
        size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-4 py-2 text-[13px]"
      } ${rest.className ?? ""}`}
      style={{ ...styles[variant], ...rest.style }}
    >
      {icon}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[11.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
};

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full min-w-0 px-3 py-2 text-[14px] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] ${props.className ?? ""}`}
      style={{ ...inputStyle, ...props.style }}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full min-w-0 appearance-none px-3 py-2 text-[14px] outline-none transition-colors focus:border-[var(--border-strong)] ${props.className ?? ""}`}
      style={{ ...inputStyle, ...props.style }}
    />
  );
}

/* ===================================================================
   Feuille modale — plein écran sur mobile, centrée sur grand écran.
   =================================================================== */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="anim-fade absolute inset-0"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-pop pb-safe relative flex max-h-[92vh] w-full max-w-full flex-col overflow-hidden sm:max-w-[520px]"
        style={{
          background: "var(--surface-1)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <header
          className="flex items-center justify-between border-b px-4 py-3.5 sm:px-5"
          style={{ borderColor: "var(--border)" }}
        >
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-full p-1.5 transition-colors hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text-secondary)" }}
          >
            <Icon.x size={18} />
          </button>
        </header>
        <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>
        {footer ? (
          <footer
            className="flex items-center justify-end gap-2 border-t px-4 py-3 sm:px-5"
            style={{ borderColor: "var(--border)" }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/* ===================================================================
   Message d'état vide — il propose l'action, il ne se contente pas de
   constater l'absence.
   =================================================================== */

export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span style={{ color: "var(--text-muted)" }}>
        <Icon.wallet size={26} />
      </span>
      <p className="text-[13.5px] font-medium">{title}</p>
      {detail ? (
        <p className="max-w-[38ch] text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {detail}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ===================================================================
   Bascule de thème

   Le thème vit hors de React : il est posé sur <html> par le script
   inline du layout, avant le premier rendu. On s'y abonne plutôt que
   d'en recopier l'état dans un useState — c'est exactement le cas
   d'usage de useSyncExternalStore, et ça évite le rendu en cascade au
   montage.
   =================================================================== */

type Theme = "light" | "dark";

function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  window.addEventListener("themechange", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("themechange", onChange);
  };
}

function readTheme(): Theme {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === "dark" || stamped === "light") return stamped;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  // Le serveur ne connaît pas les préférences du navigateur : il rend
  // la version claire, et React réconcilie après hydratation sans
  // signaler d'écart.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as Theme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Navigation privée : le thème ne survit pas à la session, ce
      // n'est pas bloquant.
    }
    window.dispatchEvent(new Event("themechange"));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Passer en clair" : "Passer en sombre"}
      className="rounded-full p-2 transition-colors hover:bg-[var(--surface-2)]"
      style={{ color: "var(--text-secondary)" }}
    >
      {theme === "dark" ? <Icon.sun size={17} /> : <Icon.moon size={17} />}
    </button>
  );
}
