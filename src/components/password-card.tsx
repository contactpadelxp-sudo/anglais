"use client";

import { useActionState } from "react";
import { updatePassword } from "@/lib/actions";
import { Button, Card, Field, Input } from "./ui/kit";

/**
 * Définition du mot de passe depuis l'application.
 *
 * Utile une fois connecté par lien email : on pose un mot de passe, et
 * les connexions suivantes n'attendent plus aucun email.
 */
export function PasswordCard() {
  const [state, action, pending] = useActionState(updatePassword, {
    status: "idle" as const,
  });

  return (
    <Card title="Mot de passe">
      <form action={action} className="flex flex-col gap-3">
        <Field
          label="Nouveau mot de passe"
          hint="Huit caractères minimum. Une fois défini, tu te connectes sans attendre d'email."
        >
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="••••••••"
          />
        </Field>
        {state.message ? (
          <p
            className="text-[12px]"
            style={{ color: state.status === "error" ? "var(--critical)" : "var(--good)" }}
          >
            {state.message}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="sm" disabled={pending} className="self-start">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>
    </Card>
  );
}
