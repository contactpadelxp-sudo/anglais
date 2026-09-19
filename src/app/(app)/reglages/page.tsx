"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Button, Card, Field, Input, Segmented, Select, Sheet } from "@/components/ui/kit";
import { Icon, StreamIcon } from "@/components/ui/icons";
import { InstallHint } from "@/components/install-hint";
import { PasswordCard } from "@/components/password-card";
import { FiscalCard } from "@/components/fiscal-card";
import { delayChecks } from "@/lib/analytics";
import { money, plural } from "@/lib/format";
import { today } from "@/lib/dates";
import { CATEGORIES, CATEGORY_ORDER, type FiscalCategory } from "@/lib/fiscal";
import type { Stream, StreamKind } from "@/lib/types";

const KINDS: { value: StreamKind; label: string; hint: string }[] = [
  { value: "resale", label: "Achat-revente", hint: "Taux de marge, coût d'achat, stock" },
  { value: "service", label: "Prestation", hint: "Montant moyen, clients, encours" },
  { value: "subscription", label: "Abonnement", hint: "Revenu récurrent mensuel" },
  { value: "benefit", label: "Allocation", hint: "Versement à date fixe" },
  { value: "other", label: "Autre", hint: "Suivi simple" },
];

export default function SettingsPage() {
  const store = useStore();
  const { streams, settings, entries } = store;
  const [editing, setEditing] = useState<Stream | null>(null);
  const [creating, setCreating] = useState(false);

  const checks = useMemo(() => delayChecks(entries, streams), [entries, streams]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[17px] font-semibold tracking-tight">Réglages</h1>

      {/* ---- Ajustements proposés par les données --------------------- */}
      {checks.length > 0 ? (
        <Card title="Délais mesurés">
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Le délai réellement observé sur tes encaissements ne colle pas au réglage. Un délai
            juste rend les prévisions justes.
          </p>
          <ul className="flex flex-col gap-2">
            {checks.map((c) => (
              <li
                key={c.stream.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2.5"
                style={{ background: "var(--surface-2)" }}
              >
                <span className="text-[12.5px]">
                  <strong>{c.stream.name}</strong>{" "}— réglé sur {c.configured} j, observé à{" "}
                  {c.observed} j sur {plural(c.sample, "encaissement", "encaissements")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => store.updateStream(c.stream.id, { settlement_days: c.observed })}
                >
                  Ajuster à {c.observed} j
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ---- Activités ------------------------------------------------- */}
      <Card
        title="Activités"
        action={
          <Button size="sm" icon={<Icon.plus size={14} />} onClick={() => setCreating(true)}>
            Nouvelle
          </Button>
        }
        padded={false}
      >
        <ul className="pb-2">
          {streams.map((stream) => {
            const used = entries.filter((e) => e.stream_id === stream.id).length;
            const cat = CATEGORIES[(stream.fiscal_category as FiscalCategory) ?? "hors"];
            return (
              <li key={stream.id}>
                <button
                  type="button"
                  onClick={() => setEditing(stream)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)] sm:px-5"
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ background: `var(--series-${stream.color_slot})`, color: "#fff" }}
                  >
                    <StreamIcon name={stream.icon} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">
                      {stream.name}
                      {stream.archived ? (
                        <span className="ml-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          archivée
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      {/* Le délai OBSERVÉ était répété ici alors que la carte
                          « Délais mesurés » juste au-dessus le dit déjà, avec le
                          bouton qui le corrige. À sa place, la catégorie fiscale :
                          c'est elle qui pilote tous les calculs, et elle
                          n'apparaissait nulle part dans cette liste. */}
                      {cat?.short ?? "Hors"}
                      {stream.fiscal_confirmed ? "" : " (à confirmer)"} ·{" "}
                      {stream.settlement_days === 0
                        ? "encaissement immédiat"
                        : `${stream.settlement_days} j de délai`}{" "}
                      · {plural(used, "écriture", "écritures")}
                    </p>
                  </div>
                  <Icon.right size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ---- Préférences ----------------------------------------------- */}
      <Card title="Préférences">
        <div className="flex flex-col gap-4">
          <Field
            label="Base de calcul par défaut"
            hint="« Encaissé » compte l'argent au jour où il arrive. « Comptabilisé » le compte au jour de la vente."
          >
            <Segmented
              value={settings.default_basis}
              // Un seul appel : `setBasis` enregistre déjà le réglage.
              // Les deux ensemble écrivaient la même valeur deux fois.
              onChange={(v) => store.setBasis(v)}
              options={[
                { value: "cash", label: "Encaissé" },
                { value: "accrual", label: "Comptabilisé" },
              ]}
            />
          </Field>

        </div>
      </Card>

      <FiscalCard />
      <PasswordCard />
      <ExportCard />
      <InstallHint />

      {editing ? (
        <StreamSheet
          stream={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            void store.updateStream(editing.id, patch);
            setEditing(null);
          }}
          onDelete={() => {
            void store.removeStream(editing.id);
            setEditing(null);
          }}
          usage={entries.filter((e) => e.stream_id === editing.id).length}
        />
      ) : null}

      {creating ? (
        <CreateSheet
          onClose={() => setCreating(false)}
          usedSlots={streams.map((s) => s.color_slot)}
          onCreate={(name, kind, slot, days, categorie) => {
            void store.addStream(name, kind, slot, days, categorie);
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

/* ===================================================================
   Export — les données t'appartiennent, elles doivent pouvoir sortir.
   =================================================================== */

function ExportCard() {
  const { entries, streamById } = useStore();

  /*
   * Le livre des recettes est celui de L'ENTREPRISE. L'allocation
   * chômage n'y a pas sa place : ce n'est pas du chiffre d'affaires,
   * elle ne supporte aucune cotisation, et la faire figurer sur le
   * livre gonflerait le CA face à un contrôleur. Même raison pour les
   * activités rangées « hors comptabilité ».
   */
  const estRecette = (streamId: string | null) => {
    const cat = streamById[streamId ?? ""]?.fiscal_category as FiscalCategory | undefined;
    return Boolean(cat && CATEGORIES[cat]?.cotise);
  };

  const annees = useMemo(() => {
    const set = new Set<string>([today().slice(0, 4)]);
    for (const e of entries) set.add((e.received_on ?? e.occurred_on).slice(0, 4));
    return [...set].sort().reverse();
  }, [entries]);

  const [annee, setAnnee] = useState(() => today().slice(0, 4));

  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Une ligne de CSV : point-virgule, guillemets doublés, BOM en tête. */
  function toCsv(header: string[], rows: (string | number)[][]) {
    const line = (cells: (string | number)[]) =>
      cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";");
    return `\ufeff${[line(header), ...rows.map(line)].join("\n")}`;
  }

  const reglement: Record<string, string> = {
    virement: "Virement",
    carte: "Carte",
    especes: "Espèces",
    cheque: "Chèque",
    plateforme: "Plateforme",
    autre: "Autre",
  };

  /*
   * Le livre des recettes. Sa forme n'est pas libre : chronologique,
   * une ligne par encaissement, portant la date, la référence de la
   * pièce, l'origine, le montant et le MODE DE RÈGLEMENT. Sont donc
   * exclues les charges (elles ne sont pas des recettes), les
   * écritures annulées, et tout ce qui n'est pas encore encaissé — la
   * comptabilité du micro-entrepreneur est tenue sur les
   * encaissements, pas sur les promesses.
   */
  function livreDesRecettes() {
    const rows = entries
      .filter(
        (e) =>
          e.direction === "in" &&
          e.status === "received" &&
          e.received_on &&
          e.received_on.slice(0, 4) === annee &&
          estRecette(e.stream_id),
      )
      .sort((a, b) => (a.received_on ?? "").localeCompare(b.received_on ?? ""))
      .map((e, i) => [
        i + 1,
        e.received_on ?? "",
        e.reference ?? "",
        e.counterparty ?? streamById[e.stream_id ?? ""]?.name ?? "",
        e.label,
        streamById[e.stream_id ?? ""]?.name ?? "",
        (e.gross_cents / 100).toFixed(2),
        e.payment_method ? reglement[e.payment_method] : "",
      ]);

    download(
      `livre-des-recettes-${annee}.csv`,
      toCsv(
        [
          "numero",
          "date_encaissement",
          "reference_piece",
          "origine",
          "libelle",
          "activite",
          "montant_encaisse",
          "mode_de_reglement",
        ],
        rows,
      ),
      "text/csv;charset=utf-8",
    );
  }

  /*
   * Le registre des achats, obligatoire dès qu'il y a de l'achat-revente.
   * Deux sources : les charges saisies, et le coût d'achat porté par
   * une vente — un article revendu a bien été acheté, même si la
   * dépense n'a pas eu sa propre écriture.
   */
  function registreDesAchats() {
    const charges = entries
      .filter(
        (e) =>
          e.direction === "out" &&
          e.status !== "cancelled" &&
          (e.received_on ?? e.occurred_on).slice(0, 4) === annee,
      )
      .map((e) => ({
        date: e.received_on ?? e.occurred_on,
        reference: e.reference ?? "",
        fournisseur: e.counterparty ?? "",
        libelle: e.label,
        cents: e.gross_cents,
        mode: e.payment_method ? reglement[e.payment_method] : "",
      }));

    const coutsDeVente = entries
      .filter(
        (e) =>
          e.direction === "in" &&
          e.status !== "cancelled" &&
          e.cost_cents > 0 &&
          (e.received_on ?? e.occurred_on).slice(0, 4) === annee,
      )
      .map((e) => ({
        date: e.occurred_on,
        reference: e.reference ?? "",
        fournisseur: "",
        libelle: `Coût d'achat — ${e.label}`,
        cents: e.cost_cents,
        mode: "",
      }));

    const rows = [...charges, ...coutsDeVente]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r, i) => [
        i + 1,
        r.date,
        r.reference,
        r.fournisseur,
        r.libelle,
        (r.cents / 100).toFixed(2),
        r.mode,
      ]);

    download(
      `registre-des-achats-${annee}.csv`,
      toCsv(
        [
          "numero",
          "date",
          "reference_piece",
          "fournisseur",
          "libelle",
          "montant",
          "mode_de_reglement",
        ],
        rows,
      ),
      "text/csv;charset=utf-8",
    );
  }

  /** Toutes les écritures, telles qu'elles sont stockées. */
  function toutesLesEcritures() {
    const rows = entries.map((e) => [
      e.occurred_on,
      e.received_on ?? "",
      streamById[e.stream_id ?? ""]?.name ?? "",
      e.label,
      e.direction === "in" ? "revenu" : "charge",
      (e.gross_cents / 100).toFixed(2),
      (e.fee_cents / 100).toFixed(2),
      (e.cost_cents / 100).toFixed(2),
      ((e.gross_cents - e.fee_cents - e.cost_cents) / 100).toFixed(2),
      e.status,
      e.counterparty ?? "",
      e.reference ?? "",
      e.payment_method ?? "",
    ]);
    download(
      `ecritures-${today()}.csv`,
      toCsv(
        [
          "date_vente",
          "date_encaissement",
          "activite",
          "libelle",
          "sens",
          "brut",
          "frais",
          "cout",
          "net",
          "statut",
          "contrepartie",
          "reference",
          "mode_de_reglement",
        ],
        rows,
      ),
      "text/csv;charset=utf-8",
    );
  }

  /*
   * Le total annoncé comptait les charges COMME des recettes (leur
   * `gross_cents` s'ajoutait) et incluait les écritures annulées. Il
   * disait donc un chiffre qui n'existe nulle part ailleurs dans
   * l'app. C'est le chiffre d'affaires encaissé de l'année, ni plus ni
   * moins — le même que celui de la page Comptabilité.
   */
  const recettes = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.direction === "in" &&
          e.status === "received" &&
          e.received_on &&
          e.received_on.slice(0, 4) === annee &&
          estRecette(e.stream_id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, annee, streamById],
  );
  const total = recettes.reduce((s, e) => s + e.gross_cents, 0);

  /** Les lignes qui ne portent pas encore leurs mentions obligatoires. */
  const incompletes = recettes.filter((e) => !e.payment_method).length;

  return (
    <Card
      title="Export"
      action={
        annees.length > 1 ? (
          <Segmented
            size="sm"
            label="Année"
            value={annee}
            onChange={setAnnee}
            options={annees.map((y) => ({ value: y, label: y }))}
          />
        ) : null
      }
    >
      <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
        {plural(recettes.length, "recette encaissée", "recettes encaissées")} en {annee}, soit{" "}
        {money(total)}{" "}
        de chiffre d&apos;affaires. L&apos;allocation chômage en est exclue : elle n&apos;est pas
        une recette de l&apos;entreprise.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={<Icon.download size={14} />} onClick={livreDesRecettes}>
          Livre des recettes
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<Icon.download size={14} />}
          onClick={registreDesAchats}
        >
          Registre des achats
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<Icon.download size={14} />}
          onClick={toutesLesEcritures}
        >
          Toutes les écritures
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<Icon.download size={14} />}
          onClick={() =>
            download(
              `sauvegarde-${today()}.json`,
              JSON.stringify(entries, null, 2),
              "application/json",
            )
          }
        >
          Sauvegarde JSON
        </Button>
      </div>

      {incompletes > 0 ? (
        <p
          className="mt-3 max-w-[72ch] rounded-[var(--radius-sm)] px-3 py-2.5 text-[12px]"
          style={{
            background: "color-mix(in oklab, var(--warning) 12%, var(--surface-2))",
            color: "var(--text-secondary)",
          }}
        >
          {plural(incompletes, "recette n'a", "recettes n'ont")} pas de mode de règlement. Le
          livre des recettes doit le porter ligne à ligne : sans lui, il n&apos;est pas
          opposable en cas de contrôle. Il s&apos;ajoute en rouvrant l&apos;écriture, sous
          « Plus de détails ».
        </p>
      ) : null}

      <p className="mt-3 max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        Le livre des recettes est la seule obligation comptable du régime micro : chronologique,
        une ligne par encaissement, avec sa référence et son mode de règlement. Le registre des
        achats s&apos;y ajoute dès qu&apos;il y a de l&apos;achat-revente. Les deux se conservent
        six ans.
      </p>
    </Card>
  );
}

/* ===================================================================
   Édition d'une activité
   =================================================================== */

function StreamSheet({
  stream,
  onClose,
  onSave,
  onDelete,
  usage,
}: {
  stream: Stream;
  onClose: () => void;
  onSave: (patch: Partial<Stream>) => void;
  onDelete: () => void;
  usage: number;
}) {
  const [name, setName] = useState(stream.name);
  const [kind, setKind] = useState<StreamKind>(stream.kind);
  const [slot, setSlot] = useState(stream.color_slot);
  const [days, setDays] = useState(String(stream.settlement_days));
  const [auto, setAuto] = useState(stream.auto_settle);
  const [categorie, setCategorie] = useState<FiscalCategory>(
    ((stream.fiscal_category as FiscalCategory) in CATEGORIES
      ? (stream.fiscal_category as FiscalCategory)
      : "hors") as FiscalCategory,
  );
  const [archived, setArchived] = useState(stream.archived);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Sheet
      open
      onClose={onClose}
      title={stream.name}
      footer={
        <>
          {confirmDelete ? (
            <>
              {/* Supprimer une activité emporte TOUTE sa comptabilité :
                  les encaissements partent avec elle, et avec eux le
                  chiffre d'affaires déjà déclaré à l'URSSAF. Archiver
                  la retire de la saisie sans toucher à l'historique —
                  c'est presque toujours ce qu'on veut. */}
              <span className="mr-auto text-[12px]" style={{ color: "var(--critical)" }}>
                {usage > 0
                  ? `${plural(usage, "écriture sera effacée", "écritures seront effacées")} — ton chiffre d'affaires déclaré avec.`
                  : "Confirmer la suppression ?"}
              </span>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
              {usage > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onSave({ archived: true });
                    onClose();
                  }}
                >
                  Archiver plutôt
                </Button>
              ) : null}
              <Button size="sm" variant="danger" onClick={onDelete}>
                Supprimer quand même
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                Supprimer
              </Button>
              <div className="flex-1" />
              <Button
                variant="primary"
                onClick={() =>
                  onSave({
                    name: name.trim() || stream.name,
                    kind,
                    color_slot: slot,
                    settlement_days: Math.max(0, Math.min(365, Number(days) || 0)),
                    auto_settle: auto,
                    fiscal_category: categorie,
                    // Choisir la catégorie à la main VAUT confirmation :
                    // le bandeau « à confirmer » de la page Comptabilité
                    // n'a plus de raison d'être après ce geste.
                    fiscal_confirmed:
                      categorie === stream.fiscal_category ? stream.fiscal_confirmed : true,
                    archived,
                  })
                }
              >
                Enregistrer
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nom">
          <Input data-autofocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Type" hint={KINDS.find((k) => k.value === kind)?.hint}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as StreamKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Catégorie fiscale" hint={CATEGORIES[categorie].note}>
          <Select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as FiscalCategory)}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].label}
              </option>
            ))}
          </Select>
        </Field>

        <ColorPicker slot={slot} onChange={setSlot} />

        <Field
          label="Délai d'encaissement"
          hint="Nombre de jours entre la vente et le versement. Sert à calculer la date d'encaissement prévue."
        >
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="max-w-[100px]"
            />
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              jours
            </span>
          </div>
        </Field>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--series-1)]"
          />
          <span>
            <span className="block text-[13px] font-medium">Confirmer automatiquement</span>
            <span className="block text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              À cocher quand le versement est fiable (Vinted, prélèvement, allocation). Sinon
              l&apos;encaissement attend ta validation.
            </span>
          </span>
        </label>

        {/* « archivée » s'affichait dans la liste sans qu'aucun écran ne
            permette de le devenir : le drapeau existait, le geste non. */}
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--series-1)]"
          />
          <span>
            <span className="block text-[13px] font-medium">Archiver</span>
            <span className="block text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              L&apos;activité disparaît de la saisie et des filtres, mais ses écritures restent
              dans la comptabilité et dans les exports. C&apos;est ce qu&apos;on veut quand une
              activité s&apos;arrête — pas la supprimer.
            </span>
          </span>
        </label>
      </div>
    </Sheet>
  );
}

function CreateSheet({
  onClose,
  onCreate,
  usedSlots,
}: {
  onClose: () => void;
  onCreate: (
    name: string,
    kind: StreamKind,
    slot: number,
    days: number,
    categorie: FiscalCategory,
  ) => void;
  usedSlots: number[];
}) {
  const firstFree = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !usedSlots.includes(s)) ?? 1;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StreamKind>("other");
  const [slot, setSlot] = useState(firstFree);
  const [days, setDays] = useState("0");
  // Une activité créée sans catégorie naissait « hors comptabilité » et
  // disparaissait des calculs sans un mot. Le choix est donc posé ici,
  // à la création, avec un défaut qui cotise.
  const [categorie, setCategorie] = useState<FiscalCategory>("bnc");

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nouvelle activité"
      footer={
        <>
          <div className="flex-1" />
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), kind, slot, Number(days) || 0, categorie)}
          >
            Créer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nom">
          <Input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Photographie, dropshipping…"
          />
        </Field>
        <Field label="Type" hint={KINDS.find((k) => k.value === kind)?.hint}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as StreamKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Catégorie fiscale" hint={CATEGORIES[categorie].note}>
          <Select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as FiscalCategory)}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].label}
              </option>
            ))}
          </Select>
        </Field>
        <ColorPicker slot={slot} onChange={setSlot} />
        <Field label="Délai d'encaissement" hint="En jours. Zéro si l'argent arrive le jour même.">
          <Input
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="max-w-[100px]"
          />
        </Field>
      </div>
    </Sheet>
  );
}

/**
 * L'ordre des couleurs n'est pas cosmétique : il a été choisi pour que
 * deux activités voisines restent distinguables en cas de daltonisme.
 * On choisit donc parmi ces huit emplacements, on n'invente pas de teinte.
 */
function ColorPicker({ slot, onChange }: { slot: number; onChange: (s: number) => void }) {
  return (
    <Field label="Couleur">
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-label={`Couleur ${s}`}
            aria-pressed={s === slot}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-transform"
            style={{
              background: `var(--series-${s})`,
              color: "#fff",
              outline: s === slot ? "2px solid var(--text-primary)" : "none",
              outlineOffset: 2,
            }}
          >
            {s === slot ? <Icon.check size={15} /> : null}
          </button>
        ))}
      </div>
    </Field>
  );
}
