"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useTransition,
} from "react";
import type {
  Basis,
  Declaration,
  PaymentMethod,
  Entry,
  EntryDraft,
  Goal,
  Settings,
  Snapshot,
  Stream,
} from "@/lib/types";
import {
  type MonthBucket,
  type MonthOverview,
  type PendingReport,
  autoSettlable,
  bucketByMonth,
  bucketFor,
  buildInsights,
  coveredMonths,
  delayChecks,
  goalProgress,
  indexStreams,
  monthOverview,
  pendingReport,
  sortStreams,
} from "@/lib/analytics";
import { type MonthKey, currentMonth, monthOf, today } from "@/lib/dates";
import { money, percent } from "@/lib/format";
import * as api from "@/lib/actions";
import {
  DEFAULT_BRACKETS,
  DEFAULT_BRACKETS_YEAR,
  DEFAULT_SALARY_ABATEMENT,
  DEFAULT_DECOTE,
  type FiscalSettings,
} from "@/lib/fiscal";

/* ===================================================================
   État
   =================================================================== */

type State = {
  streams: Stream[];
  entries: Entry[];
  goals: Goal[];
  declarations: Declaration[];
  settings: Settings;
};

type Action =
  | { type: "entry:put"; entry: Entry }
  | { type: "entry:putMany"; entries: Entry[] }
  | { type: "entry:remove"; id: string }
  | { type: "goal:put"; goal: Goal }
  | { type: "goal:remove"; month: string; streamId: string | null }
  | { type: "stream:put"; stream: Stream }
  | { type: "stream:remove"; id: string }
  | { type: "settings:put"; settings: Settings }
  | { type: "declaration:put"; declaration: Declaration }
  | { type: "declaration:remove"; period: string }
  | { type: "reset"; snapshot: Snapshot };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "entry:put": {
      const rest = state.entries.filter((e) => e.id !== action.entry.id);
      return { ...state, entries: [action.entry, ...rest] };
    }
    case "entry:putMany": {
      const ids = new Set(action.entries.map((e) => e.id));
      return {
        ...state,
        entries: [...action.entries, ...state.entries.filter((e) => !ids.has(e.id))],
      };
    }
    case "entry:remove":
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
    case "goal:put": {
      const rest = state.goals.filter(
        (g) => !(g.month === action.goal.month && g.stream_id === action.goal.stream_id),
      );
      return { ...state, goals: [...rest, action.goal] };
    }
    case "goal:remove":
      return {
        ...state,
        goals: state.goals.filter(
          (g) => !(g.month.slice(0, 7) === action.month && g.stream_id === action.streamId),
        ),
      };
    case "stream:put": {
      const rest = state.streams.filter((s) => s.id !== action.stream.id);
      return { ...state, streams: sortStreams([...rest, action.stream]) };
    }
    case "stream:remove":
      return {
        ...state,
        streams: state.streams.filter((s) => s.id !== action.id),
        entries: state.entries.filter((e) => e.stream_id !== action.id),
      };
    case "settings:put":
      return { ...state, settings: action.settings };
    case "declaration:put": {
      const rest = state.declarations.filter((d) => d.period !== action.declaration.period);
      return {
        ...state,
        declarations: [action.declaration, ...rest].sort((a, b) =>
          b.period.localeCompare(a.period),
        ),
      };
    }
    case "declaration:remove":
      return {
        ...state,
        declarations: state.declarations.filter((d) => d.period !== action.period),
      };
    case "reset":
      return { ...action.snapshot };
  }
}

/* ===================================================================
   Notifications
   =================================================================== */

export type Toast = {
  id: number;
  tone: "info" | "good" | "error";
  message: string;
  undo?: () => void;
};

/* ===================================================================
   Contexte
   =================================================================== */

type Store = {
  // données
  streams: Stream[];
  activeStreams: Stream[];
  streamById: Record<string, Stream | undefined>;
  entries: Entry[];
  goals: Goal[];
  /** Les déclarations URSSAF déjà faites, la plus récente d'abord. */
  declarations: Declaration[];
  declarationByPeriod: Record<string, Declaration | undefined>;
  settings: Settings;

  // réglages de lecture
  basis: Basis;
  setBasis: (b: Basis) => void;
  month: MonthKey;
  setMonth: (m: MonthKey) => void;
  availableMonths: MonthKey[];

  // valeurs dérivées
  buckets: Map<MonthKey, MonthBucket>;
  bucket: MonthBucket;
  overview: MonthOverview;
  pending: PendingReport;
  insights: ReturnType<typeof buildInsights>;
  goal: ReturnType<typeof goalProgress>;
  /** Les réglages fiscaux, dans la forme attendue par le moteur de calcul. */
  fiscal: FiscalSettings;
  /**
   * Vrai dès qu'au moins une écriture a été encaissée un autre mois que
   * celui de la vente, ou attend encore son versement. Tant que c'est
   * faux, la distinction encaissé / comptabilisé ne change aucun
   * chiffre : l'interface la garde pour elle plutôt que d'afficher un
   * réglage sans effet.
   */
  hasTimingGap: boolean;

  // mutations
  saveEntry: (draft: EntryDraft) => Promise<boolean>;
  removeEntry: (entry: Entry) => Promise<void>;
  settle: (ids: string[], on: string) => Promise<void>;
  unsettle: (ids: string[]) => Promise<void>;
  setGoal: (month: MonthKey, streamId: string | null, cents: number) => Promise<void>;
  updateStream: (id: string, patch: Parameters<typeof api.saveStream>[1]) => Promise<void>;
  addStream: (...args: Parameters<typeof api.createStream>) => Promise<void>;
  removeStream: (id: string) => Promise<void>;
  updateSettings: (patch: Parameters<typeof api.saveSettings>[0]) => Promise<void>;
  saveDeclaration: (patch: Parameters<typeof api.saveDeclaration>[0]) => Promise<void>;
  removeDeclaration: (period: string) => Promise<void>;

  // interface
  busy: boolean;
  toasts: Toast[];
  notify: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
  composer: EntryDraft | null;
  /** Change à chaque ouverture : sert de clé de remontage au formulaire. */
  composerKey: number;
  openComposer: (draft?: Partial<EntryDraft>) => void;
  closeComposer: () => void;
};

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore doit être appelé dans <StoreProvider>");
  return ctx;
}

/**
 * Le mode de règlement le plus probable pour une activité. Le livre
 * des recettes exige la mention, et « virement » pour tout le monde
 * était faux pour la moitié des lignes : une vente Vinted est réglée
 * par la plateforme, pas par virement direct.
 */
function reglementDe(stream: Stream | undefined): PaymentMethod {
  if (!stream) return "virement";
  return stream.kind === "resale" || stream.kind === "subscription"
    ? "plateforme"
    : "virement";
}

export function blankDraft(stream: Stream | undefined): EntryDraft {
  return {
    stream_id: stream?.id ?? null,
    direction: "in",
    label: "",
    gross_cents: 0,
    fee_cents: 0,
    cost_cents: 0,
    occurred_on: today(),
    expected_on: today(),
    received_on: today(),
    // Par défaut l'argent est déjà là : on saisit un encaissement qu'on
    // vient de recevoir, pas une promesse.
    status: "received",
    counterparty: null,
    notes: null,
    payment_method: reglementDe(stream),
    reference: null,
  };
}

export function StoreProvider({
  snapshot,
  children,
}: {
  snapshot: Snapshot;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, snapshot);
  /*
   * La base de calcul vivait à DEUX endroits : un état local ici, et
   * `settings.default_basis` en base. La bascule de l'en-tête ne
   * touchait que le premier, celle des Réglages lisait le second : les
   * deux commandes affichaient des valeurs différentes du même
   * réglage. Elle n'a plus qu'une source.
   */
  const basis: Basis = state.settings.default_basis;
  const [month, setMonth] = useState<MonthKey>(currentMonth());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [composer, setComposer] = useState<EntryDraft | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [busy, startTransition] = useTransition();

  const notify = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  /* --- valeurs dérivées : tout est recalculé en mémoire --------------- */

  const activeStreams = useMemo(
    () => sortStreams(state.streams.filter((s) => !s.archived)),
    [state.streams],
  );
  const streamById = useMemo(() => indexStreams(state.streams), [state.streams]);
  const buckets = useMemo(() => bucketByMonth(state.entries, basis), [state.entries, basis]);
  const bucket = useMemo(() => bucketFor(buckets, month), [buckets, month]);
  const overview = useMemo(() => monthOverview(buckets, month), [buckets, month]);
  const pending = useMemo(
    () => pendingReport(state.entries, state.streams),
    [state.entries, state.streams],
  );
  const availableMonths = useMemo(() => coveredMonths(state.entries), [state.entries]);

  const declarationByPeriod = useMemo(() => {
    const out: Record<string, Declaration | undefined> = {};
    for (const d of state.declarations) out[d.period] = d;
    return out;
  }, [state.declarations]);

  const fiscal = useMemo<FiscalSettings>(
    () => ({
      activityStart: state.settings.activity_start,
      acreEnabled: state.settings.acre_enabled,
      versementLiberatoire: state.settings.versement_liberatoire,
      taxParts: Number(state.settings.tax_parts) || 1,
      otherIncomeCents: state.settings.other_income_cents ?? 0,
      brackets:
        state.settings.tax_brackets && state.settings.tax_brackets.length > 0
          ? state.settings.tax_brackets
          : DEFAULT_BRACKETS,
      bracketsYear: state.settings.tax_brackets_year ?? DEFAULT_BRACKETS_YEAR,
      salaryAbatement: state.settings.salary_abatement ?? DEFAULT_SALARY_ABATEMENT,
      decote: state.settings.decote ?? DEFAULT_DECOTE,
    }),
    [state.settings],
  );

  const hasTimingGap = useMemo(
    () =>
      state.entries.some(
        (e) =>
          e.status === "pending" ||
          (e.received_on !== null && monthOf(e.received_on) !== monthOf(e.occurred_on)),
      ),
    [state.entries],
  );

  const goal = useMemo(
    () => goalProgress(state.goals, month, bucket.net, null),
    [state.goals, month, bucket.net],
  );

  const insights = useMemo(
    () =>
      buildInsights({
        basis,
        month,
        overview,
        pending,
        streams: state.streams,
        goal,
        entries: state.entries,
        delays: delayChecks(state.entries, state.streams),
        fmt: (c) => money(c),
        pct: (r) => percent(r),
      }),
    [basis, month, overview, pending, state.streams, goal, state.entries],
  );

  /* --- mutations : optimistes, avec retour en arrière sur échec ------ */

  const run = useCallback(
    async <T,>(
      fn: () => Promise<api.ActionResult<T>>,
      onOk: (data: T) => void,
      okMessage?: string,
    ): Promise<boolean> => {
      /*
       * Une action serveur qui n'atteint pas le serveur ne renvoie pas
       * une erreur : elle LÈVE. Sans ce filet, l'exception remontait au
       * formulaire, qui restait bloqué sur « … » sans un mot — le cas
       * du métro, du tunnel, ou d'un avion. On la traduit en un échec
       * ordinaire, avec une phrase qui dit quoi faire.
       */
      let result: api.ActionResult<T>;
      try {
        result = await fn();
      } catch {
        notify({
          tone: "error",
          message:
            typeof navigator !== "undefined" && navigator.onLine === false
              ? "Pas de connexion : rien n'a été enregistré. Réessaie une fois le réseau revenu."
              : "Le serveur n'a pas répondu. Rien n'a été enregistré — réessaie.",
        });
        return false;
      }
      if (!result.ok) {
        notify({ tone: "error", message: result.error });
        return false;
      }
      startTransition(() => onOk(result.data));
      if (okMessage) notify({ tone: "good", message: okMessage });
      return true;
    },
    [notify],
  );

  const saveEntry = useCallback(
    (draft: EntryDraft) =>
      run(
        () => api.saveEntry(draft),
        (entry) => dispatch({ type: "entry:put", entry }),
        draft.id ? "Écriture mise à jour." : "Revenu ajouté.",
      ),
    [run],
  );

  const removeEntry = useCallback(
    async (entry: Entry) => {
      const result = await api.deleteEntry(entry.id);
      if (!result.ok) {
        notify({ tone: "error", message: result.error });
        return;
      }
      dispatch({ type: "entry:remove", id: entry.id });
      notify({
        tone: "info",
        message: "Écriture supprimée.",
        // Le rétablissement recrée la ligne à l'identique, sauf son
        // identifiant : c'est une nouvelle ligne au même contenu.
        undo: () => {
          void api.saveEntry({ ...entry, id: undefined }).then((r) => {
            if (r.ok) dispatch({ type: "entry:put", entry: r.data });
          });
        },
      });
    },
    [notify],
  );

  const settle = useCallback(
    async (ids: string[], on: string) => {
      await run(
        () => api.settleEntries(ids, on),
        (entries) => dispatch({ type: "entry:putMany", entries }),
        `${ids.length} encaissement${ids.length > 1 ? "s confirmés" : " confirmé"}.`,
      );
    },
    [run],
  );

  const unsettle = useCallback(
    async (ids: string[]) => {
      await run(
        () => api.unsettleEntries(ids),
        (entries) => dispatch({ type: "entry:putMany", entries }),
        "Remis en attente.",
      );
    },
    [run],
  );

  const setGoal = useCallback(
    async (m: MonthKey, streamId: string | null, cents: number) => {
      const result = await api.saveGoal(m, streamId, cents);
      if (!result.ok) {
        notify({ tone: "error", message: result.error });
        return;
      }
      if (result.data) dispatch({ type: "goal:put", goal: result.data });
      else dispatch({ type: "goal:remove", month: m, streamId });
    },
    [notify],
  );

  const updateStream = useCallback(
    async (id: string, patch: Parameters<typeof api.saveStream>[1]) => {
      await run(
        () => api.saveStream(id, patch),
        (stream) => dispatch({ type: "stream:put", stream }),
      );
    },
    [run],
  );

  const addStream = useCallback(
    async (...args: Parameters<typeof api.createStream>) => {
      await run(
        () => api.createStream(...args),
        (stream) => dispatch({ type: "stream:put", stream }),
        "Activité créée.",
      );
    },
    [run],
  );

  const removeStream = useCallback(
    async (id: string) => {
      await run(
        () => api.deleteStream(id),
        () => dispatch({ type: "stream:remove", id }),
        "Activité supprimée.",
      );
    },
    [run],
  );

  const saveDeclaration = useCallback(
    async (patch: Parameters<typeof api.saveDeclaration>[0]) => {
      await run(
        () => api.saveDeclaration(patch),
        (declaration) => dispatch({ type: "declaration:put", declaration }),
        "Déclaration enregistrée.",
      );
    },
    [run],
  );

  const removeDeclaration = useCallback(
    async (period: string) => {
      await run(
        () => api.deleteDeclaration(period),
        () => dispatch({ type: "declaration:remove", period }),
        "Déclaration effacée.",
      );
    },
    [run],
  );

  const updateSettings = useCallback(
    async (patch: Parameters<typeof api.saveSettings>[0]) => {
      await run(
        () => api.saveSettings(patch),
        (settings) => dispatch({ type: "settings:put", settings }),
      );
    },
    [run],
  );

  const setBasis = useCallback(
    (b: Basis) => {
      // Optimiste : l'écran suit le doigt, l'enregistrement suit après.
      dispatch({ type: "settings:put", settings: { ...state.settings, default_basis: b } });
      void api.saveSettings({ default_basis: b });
    },
    [state.settings],
  );

  /* --- confirmation automatique des encaissements fiables ------------ */

  useEffect(() => {
    const due = autoSettlable(state.entries, state.streams);
    if (due.length === 0) return;
    const ids = due.map((d) => d.entry.id);
    void api.settleEntriesOnOwnDates(due.map((d) => ({ id: d.entry.id, on: d.on }))).then((r) => {
      if (!r.ok) return;
      dispatch({ type: "entry:putMany", entries: r.data });
      notify({
        tone: "info",
        message: `${due.length} encaissement${due.length > 1 ? "s confirmés" : " confirmé"} automatiquement.`,
        undo: () => {
          void api.unsettleEntries(ids).then((u) => {
            if (u.ok) dispatch({ type: "entry:putMany", entries: u.data });
          });
        },
      });
    });
    // Un seul passage au montage : les écritures créées ensuite sont
    // déjà encaissées à la saisie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openComposer = useCallback(
    (draft?: Partial<EntryDraft>) => {
      /*
       * L'activité proposée est la DERNIÈRE utilisée, pas la première
       * de la liste : on saisit presque toujours plusieurs écritures de
       * la même activité d'affilée, et repartir de la première obligeait
       * à la rechoisir à chaque fois.
       */
      const derniere = state.entries.find((e) => e.stream_id)?.stream_id ?? null;
      const defaut =
        activeStreams.find((s) => s.id === derniere) ?? activeStreams[0];
      const base = blankDraft(defaut);
      setComposer({ ...base, ...draft });
      setComposerKey((k) => k + 1);
    },
    [activeStreams, state.entries],
  );

  const closeComposer = useCallback(() => setComposer(null), []);

  const value: Store = {
    streams: state.streams,
    activeStreams,
    streamById,
    entries: state.entries,
    goals: state.goals,
    declarations: state.declarations,
    declarationByPeriod,
    settings: state.settings,
    basis,
    setBasis,
    month,
    setMonth,
    availableMonths,
    buckets,
    bucket,
    overview,
    pending,
    insights,
    goal,
    fiscal,
    hasTimingGap,
    saveEntry,
    removeEntry,
    settle,
    unsettle,
    setGoal,
    updateStream,
    addStream,
    removeStream,
    updateSettings,
    saveDeclaration,
    removeDeclaration,
    busy,
    toasts,
    notify,
    dismiss,
    composer,
    composerKey,
    openComposer,
    closeComposer,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
