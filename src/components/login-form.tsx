"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { requestMagicLink, signInWithPassword, verifyCode } from "@/lib/actions";
import { Button, Field, Input } from "./ui/kit";

/**
 * Connexion.
 *
 * Le mot de passe est le chemin principal : rien à attendre, aucun quota
 * d'envoi, et la session s'ouvre là où on est. Le lien par email reste
 * en secours — c'est aussi le seul recours quand le mot de passe est
 * oublié — mais il ne barre plus la route au cas courant.
 */
export function LoginForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [mode, setMode] = useState<"password" | "email">("password");

  const [signIn, signInAction, signingIn] = useActionState(signInWithPassword, {
    status: "idle" as const,
  });
  const [request, requestAction, requesting] = useActionState(requestMagicLink, {
    status: "idle" as const,
  });
  const [verify, verifyAction, verifying] = useActionState(verifyCode, {
    status: "idle" as const,
  });

  const enter = () => {
    router.replace("/");
    router.refresh();
  };

  if (mode === "password") {
    return (
      <div className="flex flex-col gap-4">
        {/* La redirection est faite par l'action serveur, une fois la
            session écrite dans les cookies. */}
        <form action={signInAction} className="flex flex-col gap-3">
          <Field label="Adresse email">
            <Input
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@exemple.fr"
            />
          </Field>
          <Field label="Mot de passe">
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              placeholder="••••••••"
            />
          </Field>
          {signIn.status === "error" ? (
            <p className="text-[12px]" style={{ color: "var(--critical)" }}>
              {signIn.message}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={signingIn}>
            {signingIn ? "Connexion…" : "Se connecter"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode("email")}
          className="self-start text-[12px] underline-offset-2 hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          Mot de passe oublié — recevoir un lien par email
        </button>
      </div>
    );
  }

  const sent = request.status === "sent";

  return (
    <div className="flex flex-col gap-4">
      {!sent ? (
        <form action={requestAction} className="flex flex-col gap-3">
          <Field
            label="Adresse email"
            hint="Un lien de connexion arrive par email. Ouvre-le depuis ce navigateur."
          >
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {request.status === "error" ? (
            <p className="text-[12px]" style={{ color: "var(--critical)" }}>
              {request.message}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={requesting}>
            {requesting ? "Envoi…" : "Recevoir un lien"}
          </Button>
        </form>
      ) : (
        <form
          action={async (formData) => {
            await verifyAction(formData);
            enter();
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="email" value={request.email ?? email} />
          <Field
            label="Code reçu"
            hint={`Envoyé à ${request.email ?? email}. Si l'email contient un lien plutôt qu'un code, ouvre simplement le lien.`}
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
        </form>
      )}

      <button
        type="button"
        onClick={() => setMode("password")}
        className="self-start text-[12px] underline-offset-2 hover:underline"
        style={{ color: "var(--text-muted)" }}
      >
        Revenir au mot de passe
      </button>
    </div>
  );
}
