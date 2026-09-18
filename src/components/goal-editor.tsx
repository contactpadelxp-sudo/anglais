"use client";

import { useState } from "react";
import type { GoalProgress } from "@/lib/analytics";
import { Button, Field, Input, Sheet } from "./ui/kit";
import { Icon } from "./ui/icons";
import { centsToInput, money, parseMoney } from "@/lib/format";
import { monthLabel, type MonthKey } from "@/lib/dates";

export function GoalEditor({
  month,
  goal,
  actual,
  onSave,
  trigger,
}: {
  month: MonthKey;
  goal: GoalProgress | null;
  actual: number;
  onSave: (cents: number) => void;
  /**
   * Déclencheur personnalisé. Le tableau de bord ouvre la feuille
   * depuis son anneau de progression ; la logique de saisie, elle,
   * n'existe qu'ici.
   */
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  function start() {
    setValue(goal ? centsToInput(goal.target) : "");
    setOpen(true);
  }

  return (
    <>
      {trigger ? (
        trigger(start)
      ) : (
        <button
          type="button"
          onClick={start}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--surface-2)]"
          style={{ color: "var(--text-secondary)" }}
        >
          <Icon.target size={14} />
          {goal ? `Objectif ${money(goal.target)}` : "Définir un objectif"}
        </button>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Objectif — ${monthLabel(month, "full")}`}
        footer={
          <>
            {goal ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  onSave(0);
                  setOpen(false);
                }}
              >
                Retirer
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button
              variant="primary"
              onClick={() => {
                onSave(parseMoney(value));
                setOpen(false);
              }}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <Field
          label="Montant visé ce mois-ci"
          hint={`Tu en es à ${money(actual)}. L'objectif porte sur le net après achats.`}
        >
          <Input
            data-autofocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="2000"
          />
        </Field>
      </Sheet>
    </>
  );
}
