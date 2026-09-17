"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestMagicLink, verifyCode } from "@/lib/actions";
import { Button, Field, Input } from "./ui/kit";

/**
 * Connexion en deux temps : on demande le code, puis on le saisit.
 *
 * Le code à six chiffres est préféré au lien cliquable : sur une PWA
 * installée, un lien ouvert depuis l'app Mail atterrit dans le
 * navigateur et non dans l'app, ce qui casse la session.
 */
export function LoginForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [request, requestAction, requesting] = useActionState(requestMagicLink, {
    status: "idle" as const,
  });
  const [verify, verifyAction, verifying] = useActionState(verifyCode, {
    status: "idle" as const,
  });
  const [email, setEmail] = useState(defaultEmail);

  const sent = request.status === "sent";

  useEffect(() => {
    // La vérification réussie ne renvoie pas de message : c'est le
    // signal que la session est ouverte.
    if (verify.status === "idle" && verifying === false && verify.message === undefined) return;
  }, [verify, verifying]);

  return (
    <div className="flex flex-col gap-4">
      {!sent ? (
        <form action={requestAction} className="flex flex-col gap-3">
          <Field label="Adresse email">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@exemple.fr"
            />
          </Field>
          {request.status === "error" ? (
            <p className="text-[12px]" style={{ color: "var(--critical)" }}>
              {request.message}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={requesting}>
            {requesting ? "Envoi…" : "Recevoir le code"}
          </Button>
        </form>
      ) : (
        <form
          action={async (formData) => {
            await verifyAction(formData);
            router.replace("/");
            router.refresh();
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="email" value={request.email ?? email} />
          <Field
            label="Code reçu"
            hint={`Envoyé à ${request.email ?? email}. Si l'email contient un lien plutôt qu'un code, ouvre simplement le lien : il ouvre la session directement.`}
          >
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              placeholder="000000"
              maxLength={10}
              className="tnum !text-[20px] tracking-[0.3em]"
            />
          </Field>
          {verify.status === "error" ? (
            <p className="text-[12px]" style={{ color: "var(--critical)" }}>
              {verify.message}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={verifying}>
            {verifying ? "Vérification…" : "Se connecter"}
          </Button>
          <form action={requestAction}>
            <input type="hidden" name="email" value={request.email ?? email} />
            <button
              type="submit"
              className="text-[12px] underline-offset-2 hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              Renvoyer un code
            </button>
          </form>
        </form>
      )}
    </div>
  );
}
