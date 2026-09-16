"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Card, Button } from "./ui/kit";
import { Icon } from "./ui/icons";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Safari iOS n'a pas implémenté display-mode: standalone avant la 17. */
type IosNavigator = Navigator & { standalone?: boolean };

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

const noop = () => () => {};

/**
 * Installation sur l'écran d'accueil.
 *
 * Chrome et Edge exposent `beforeinstallprompt` et savent ouvrir la
 * boîte de dialogue native. Safari iOS ne l'expose pas : là, la seule
 * chose honnête est d'expliquer le geste.
 */
export function InstallHint() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const standalone = useSyncExternalStore(subscribeDisplayMode, readStandalone, () => false);
  const ios = useSyncExternalStore(
    noop,
    () => /iPad|iPhone|iPod/.test(navigator.userAgent),
    () => false,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone) {
    return (
      <Card title="Installation">
        <p
          className="flex items-center gap-2 text-[12.5px]"
          style={{ color: "var(--text-secondary)" }}
        >
          <span style={{ color: "var(--good)" }}>
            <Icon.check size={15} />
          </span>
          L&apos;app est installée sur cet appareil.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Installer sur l'écran d'accueil">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[46ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
          {ios
            ? "Sur iPhone : touche le bouton Partager dans Safari, puis « Sur l'écran d'accueil ». L'app s'ouvrira en plein écran, sans barre de navigateur."
            : "Installe l'app pour l'ouvrir en plein écran depuis ton écran d'accueil, comme une application native."}
        </p>
        {prompt ? (
          <Button
            variant="primary"
            size="sm"
            icon={<Icon.download size={14} />}
            onClick={async () => {
              await prompt.prompt();
              const choice = await prompt.userChoice;
              if (choice.outcome === "accepted") setPrompt(null);
            }}
          >
            Installer
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
