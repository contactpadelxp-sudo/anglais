"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "./ui/icons";

/**
 * Invitation à installer l'app sur l'écran d'accueil.
 *
 * iOS n'expose aucune API d'installation : `beforeinstallprompt`
 * n'existe pas dans Safari, et rien dans le manifeste ne peut faire
 * disparaître la barre du navigateur tant que l'app est ouverte dans
 * un onglet. Le seul geste qui marche est manuel — Partager, puis
 * « Sur l'écran d'accueil » — donc la seule chose utile à faire est de
 * le dire, à l'endroit où l'app s'utilise, et pas au fond des
 * réglages où personne ne va le chercher.
 *
 * La bannière disparaît d'elle-même une fois l'app installée :
 * `display-mode: standalone` devient vrai, et ce composant ne rend
 * plus rien.
 */

type IosNavigator = Navigator & { standalone?: boolean };
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED = "install-banner-dismissed";

function subscribeDisplayMode(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as IosNavigator).standalone === true
  );
}

/**
 * Le choix « plus tard » vit hors de React : c'est du stockage
 * navigateur, que le serveur ne connaît pas. L'instantané serveur dit
 * « masqué » pour que le HTML envoyé ne contienne jamais une bannière
 * qui disparaîtrait à l'hydratation.
 */
let dismissedCache: boolean | null = null;
const listeners = new Set<() => void>();

function subscribeDismissed(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function readDismissed() {
  if (dismissedCache === null) {
    try {
      dismissedCache = localStorage.getItem(DISMISSED) === "1";
    } catch {
      dismissedCache = false;
    }
  }
  return dismissedCache;
}

function dismissForever() {
  dismissedCache = true;
  try {
    localStorage.setItem(DISMISSED, "1");
  } catch {
    /* navigation privée : la bannière reviendra, tant pis */
  }
  for (const l of listeners) l();
}

const noop = () => () => {};

export function InstallBanner() {
  const standalone = useSyncExternalStore(subscribeDisplayMode, readStandalone, () => false);
  const hidden = useSyncExternalStore(subscribeDismissed, readDismissed, () => true);
  const ios = useSyncExternalStore(
    noop,
    () => /iPad|iPhone|iPod/.test(navigator.userAgent),
    () => false,
  );
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || hidden) return null;

  const dismiss = dismissForever;

  return (
    <div
      className="anim-rise flex items-start gap-3 rounded-[var(--radius)] border p-3.5"
      style={{
        borderColor: "color-mix(in oklab, var(--series-1) 30%, var(--border))",
        background: "color-mix(in oklab, var(--series-1) 7%, var(--surface-1))",
      }}
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: "var(--series-1)", color: "#fff" }}
      >
        <Icon.download size={17} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">Installer l&apos;app sur ton téléphone</p>
        {ios || !prompt ? (
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {ios ? (
              <>
                Touche{" "}
                <span
                  className="inline-flex translate-y-[3px] items-center px-0.5"
                  style={{ color: "var(--series-1)" }}
                >
                  <Icon.share size={14} />
                </span>{" "}
                en bas de Safari, puis <strong>Sur l&apos;écran d&apos;accueil</strong>. L&apos;app
                s&apos;ouvrira en plein écran, sans barre d&apos;adresse.
              </>
            ) : (
              <>
                Depuis le menu du navigateur, choisis{" "}
                <strong>Installer l&apos;application</strong>{" "}
                pour l&apos;ouvrir en plein écran.
              </>
            )}
          </p>
        ) : (
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Un écran d&apos;accueil, pas d&apos;onglet, pas de barre d&apos;adresse.
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          {prompt ? (
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--series-1)", color: "#fff" }}
              onClick={async () => {
                await prompt.prompt();
                const choice = await prompt.userChoice;
                if (choice.outcome === "accepted") setPrompt(null);
              }}
            >
              Installer
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full px-2.5 py-1.5 text-[12px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Plus tard
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer"
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-[var(--surface-2)]"
        style={{ color: "var(--text-muted)" }}
      >
        <Icon.x size={15} />
      </button>
    </div>
  );
}
