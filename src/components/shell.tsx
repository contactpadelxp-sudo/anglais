"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "./store";
import { Composer } from "./composer";
import { InstallBanner } from "./install-banner";
import { Icon, type IconName } from "./ui/icons";
import { Segmented, ThemeToggle } from "./ui/kit";
import { monthLabel, monthRange, shiftMonth, currentMonth, type MonthKey } from "@/lib/dates";
import { signOut } from "@/lib/actions";

const NAV: { href: string; label: string; icon: IconName; short?: string }[] = [
  { href: "/", label: "Tableau de bord", icon: "home", short: "Tableau" },
  { href: "/revenus", label: "Revenus", icon: "list" },
  { href: "/comptabilite", label: "Comptabilité", icon: "wallet", short: "Compta" },
  { href: "/analyse", label: "Analyse", icon: "chart" },
  { href: "/activites", label: "Activités", icon: "layers" },
  { href: "/reglages", label: "Réglages", icon: "settings" },
];

// Six onglets ne tiennent pas en bas d'un écran de téléphone. « Activités »
// sort de la barre : elle reste atteignable depuis les réglages et depuis
// la répartition du tableau de bord.
const MOBILE_NAV = NAV.filter((n) => n.href !== "/activites");

export function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  const store = useStore();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar email={email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-4 px-4 pb-28 pt-4 sm:px-6 lg:pb-10">
          <InstallBanner />
          {children}
        </main>
      </div>
      <BottomBar />
      <FloatingAdd />
      {store.composer ? (
        <Composer key={store.composerKey} initial={store.composer} />
      ) : null}
      <Toasts />
    </div>
  );
}

/* ===================================================================
   Navigation latérale (grand écran)
   =================================================================== */

function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r px-3 py-5 lg:flex"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <div className="mb-6 flex items-center gap-2 px-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">Revenus</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Glyph = Icon[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] font-medium transition-colors"
              style={{
                background: active ? "var(--surface-2)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <Glyph size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="border-t px-2 pt-3" style={{ borderColor: "var(--border)" }}>
        <p className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
          {email}
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:text-[var(--text-primary)]"
            style={{ color: "var(--text-secondary)" }}
          >
            <Icon.logout size={14} />
            Se déconnecter
          </button>
        </form>
      </div>
    </aside>
  );
}

function Logo() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 items-center justify-center rounded-[9px]"
      style={{ background: "var(--series-1)", color: "#fff" }}
    >
      <Icon.chart size={16} />
    </span>
  );
}

/* ===================================================================
   En-tête : sélecteur de mois + base de calcul.
   Ces deux contrôles cadrent toute la page qui suit — d'où leur place
   sur une seule ligne, au-dessus du contenu, et jamais dans une carte.
   =================================================================== */

function Header() {
  const { month, setMonth, basis, setBasis, hasTimingGap } = useStore();

  return (
    <header
      className="pt-safe sticky top-0 z-30 border-b backdrop-blur-xl"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in oklab, var(--plane) 82%, transparent)",
      }}
    >
      {/* Le sélecteur de base ne tient pas sur la même ligne que le mois
          à 390 px : il passait sous le bord droit de l'écran, coupé et
          inatteignable. Il descend d'une ligne au lieu de disparaître. */}
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-2 px-4 py-2.5 sm:flex-nowrap sm:px-6">
        <span className="flex items-center gap-2 lg:hidden">
          <Logo />
        </span>
        <MonthStepper month={month} onChange={setMonth} />
        <div className="flex-1" />
        <ThemeToggle />
        {hasTimingGap ? (
          <div className="order-last w-full sm:order-none sm:w-auto">
            <Segmented
              label="Base de calcul"
              size="sm"
              full
              value={basis}
              onChange={setBasis}
              options={[
                {
                  value: "cash",
                  label: "Encaissé",
                  hint: "L'argent au jour où il arrive sur le compte",
                },
                {
                  value: "accrual",
                  label: "Comptabilisé",
                  hint: "La vente au jour où elle est conclue",
                },
              ]}
            />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function MonthStepper({
  month,
  onChange,
}: {
  month: MonthKey;
  onChange: (m: MonthKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const isCurrent = month === currentMonth();

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Mois précédent"
        className="rounded-full p-1.5 transition-colors hover:bg-[var(--surface-2)]"
        style={{ color: "var(--text-secondary)" }}
      >
        <Icon.left size={17} />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="min-w-[128px] rounded-full px-2.5 py-1 text-[13.5px] font-semibold tracking-tight transition-colors hover:bg-[var(--surface-2)]"
      >
        {monthLabel(month, "full")}
      </button>

      {/* Borné au mois courant, comme la liste déroulante juste à côté :
          la flèche emmenait dans un futur sans données, que la liste ne
          proposait pas et où aucune coche n'était affichée. */}
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isCurrent}
        aria-label="Mois suivant"
        className="rounded-full p-1.5 transition-colors enabled:hover:bg-[var(--surface-2)] disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
      >
        <Icon.right size={17} />
      </button>

      {!isCurrent ? (
        <button
          type="button"
          onClick={() => onChange(currentMonth())}
          className="ml-1 hidden rounded-full px-2 py-1 text-[11.5px] font-medium sm:block"
          style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
        >
          Ce mois-ci
        </button>
      ) : null}

      {open ? (
        <div
          className="anim-pop absolute left-0 top-full z-40 mt-2 max-h-[300px] w-[190px] overflow-y-auto p-1"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-pop)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {monthRange(currentMonth(), 24)
            .reverse()
            .map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--surface-2)]"
                style={{ color: m === month ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                {monthLabel(m, "full")}
                {m === month ? <Icon.check size={15} /> : null}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/* ===================================================================
   Navigation basse (mobile) — quatre onglets et le bouton d'ajout.
   =================================================================== */

function BottomBar() {
  const pathname = usePathname();
  const items = MOBILE_NAV.filter((n) => n.href !== "/reglages");

  return (
    <nav
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl lg:hidden"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in oklab, var(--surface-1) 88%, transparent)",
      }}
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Glyph = Icon[item.icon];
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className="flex flex-col items-center gap-0.5 py-2"
                style={{ color: active ? "var(--series-1)" : "var(--text-muted)" }}
              >
                <Glyph size={20} />
                <span className="text-[10px] font-medium">
                  {item.short ?? item.label.split(" ")[0]}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <Link
            href="/reglages"
            className="flex flex-col items-center gap-0.5 py-2"
            style={{
              color: pathname.startsWith("/reglages") ? "var(--series-1)" : "var(--text-muted)",
            }}
          >
            <Icon.settings size={20} />
            <span className="text-[10px] font-medium">Réglages</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/* ===================================================================
   Bouton d'ajout — toujours atteignable, au pouce sur mobile.
   =================================================================== */

function FloatingAdd() {
  const { openComposer } = useStore();
  return (
    <button
      type="button"
      onClick={() => openComposer()}
      aria-label="Ajouter un revenu"
      className="fixed bottom-[76px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full transition-transform active:scale-95 lg:bottom-6 lg:right-6"
      style={{
        background: "var(--text-primary)",
        color: "var(--surface-1)",
        boxShadow: "var(--shadow-pop)",
        marginBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <Icon.plus size={24} />
    </button>
  );
}

/* ===================================================================
   Notifications
   =================================================================== */

function Toasts() {
  const { toasts, dismiss } = useStore();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[150px] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-24 lg:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="anim-pop pointer-events-auto flex w-full max-w-[400px] items-center gap-3 px-3.5 py-2.5"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <span
            aria-hidden
            style={{
              color:
                t.tone === "error"
                  ? "var(--critical)"
                  : t.tone === "good"
                    ? "var(--good)"
                    : "var(--text-muted)",
            }}
          >
            {t.tone === "error" ? <Icon.alert size={16} /> : <Icon.check size={16} />}
          </span>
          <span className="flex-1 text-[12.5px]">{t.message}</span>
          {t.undo ? (
            <button
              type="button"
              onClick={() => {
                t.undo?.();
                dismiss(t.id);
              }}
              className="text-[12px] font-semibold"
              style={{ color: "var(--series-1)" }}
            >
              Annuler
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Fermer"
            style={{ color: "var(--text-muted)" }}
          >
            <Icon.x size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
