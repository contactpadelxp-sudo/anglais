-- =====================================================================
--  Ménage dans le modèle, et ce qu'il manquait pour tenir une
--  comptabilité de micro-entrepreneur.
--
--  Trois mouvements :
--    1. rattraper une colonne que l'app utilise mais qu'aucune
--       migration ne créait ;
--    2. retirer quatre colonnes inertes ;
--    3. ajouter ce qui manque pour le livre des recettes et le suivi
--       des déclarations URSSAF.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rattrapage
--
-- `fiscal_confirmed` est lue par la page Comptabilité et écrite par son
-- bouton « c'est confirmé » depuis le premier jour, mais elle n'était
-- créée par aucune migration : le dépôt ne décrivait plus la base, et
-- une base repartie de zéro cassait sur cette page.
-- ---------------------------------------------------------------------
alter table public.streams
  add column if not exists fiscal_confirmed boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. Colonnes inertes
--
-- Aucune ne portait jamais autre chose que sa valeur par défaut :
--   entries.tags            toujours '{}', jamais lue
--   entries.quantity        toujours 1, jamais lue
--   settings.currency       toujours 'EUR' — money() code l'euro en dur
--   settings.fiscal_year_start  toujours 1, lue nulle part ; l'exercice
--                           d'une micro-entreprise EST l'année civile,
--                           la colonne laissait croire le contraire
--
-- `entries.meta` est conservée à dessein : c'est là que se rangera la
-- charge utile d'un import Vinted, seule évolution déjà nommée.
-- ---------------------------------------------------------------------
alter table public.entries  drop column if exists tags;
alter table public.entries  drop column if exists quantity;
alter table public.settings drop column if exists currency;
alter table public.settings drop column if exists fiscal_year_start;

-- ---------------------------------------------------------------------
-- 3. Le livre des recettes
--
-- L'obligation comptable du micro-entrepreneur est un livre des
-- recettes tenu par ordre chronologique, portant pour chaque ligne :
-- la date, l'origine (le client), le montant, la référence de la pièce
-- justificative et le MODE DE RÈGLEMENT. Les deux derniers manquaient,
-- donc l'export n'était pas opposable.
-- ---------------------------------------------------------------------
--
-- Chaque colonne est posée seule, et ses règles sont réaffirmées
-- ensuite par leurs propres instructions. Raison : « add column if not
-- exists ... check (...) » saute le sous-ordre ENTIER quand la colonne
-- existe déjà. La contrainte, le not null et le default partent avec,
-- la migration renvoie un succès, et rien ne signale que le garde-fou
-- n'est pas en place.
--
alter table public.entries add column if not exists payment_method text;
alter table public.entries drop constraint if exists entries_payment_method_check;
alter table public.entries
  add constraint entries_payment_method_check
  check (payment_method is null or payment_method in (
    'virement', 'carte', 'especes', 'cheque', 'plateforme', 'autre'
  ));

-- Numéro de facture, de virement, de bordereau : ce qui permet de
-- retrouver la pièce. Libre, parce que les plateformes numérotent
-- chacune à leur façon.
alter table public.entries add column if not exists reference text;

-- Remettre une écriture « en attente » était défait au chargement
-- suivant : sa date prévue restait dans le passé et la confirmation
-- automatique la rattrapait. Le geste est manuel, donc il se mémorise,
-- et il se lève dès qu'on rouvre l'écriture.
alter table public.entries add column if not exists settle_locked boolean;
update public.entries set settle_locked = false where settle_locked is null;
alter table public.entries alter column settle_locked set default false;
alter table public.entries alter column settle_locked set not null;

-- ---------------------------------------------------------------------
-- 4. Les déclarations URSSAF
--
-- L'app savait calculer ce qui est dû, jamais ce qui a été déclaré ni
-- payé. Elle ne pouvait donc ni rappeler une échéance, ni signaler un
-- écart entre l'appel de l'URSSAF et son propre calcul.
-- ---------------------------------------------------------------------
-- Périodicité choisie à l'inscription, et irréversible dans l'année.
alter table public.settings add column if not exists urssaf_period text;
update public.settings set urssaf_period = 'monthly' where urssaf_period is null;
alter table public.settings alter column urssaf_period set default 'monthly';
alter table public.settings alter column urssaf_period set not null;
alter table public.settings drop constraint if exists settings_urssaf_period_check;
alter table public.settings
  add constraint settings_urssaf_period_check
  check (urssaf_period in ('monthly', 'quarterly'));

-- Part du chiffre d'affaires à mettre de côté à chaque encaissement,
-- en points de base. 0 signifie que l'app la déduit des taux réels.
alter table public.settings add column if not exists provision_bps integer;
update public.settings set provision_bps = 0 where provision_bps is null;
alter table public.settings alter column provision_bps set default 0;
alter table public.settings alter column provision_bps set not null;
alter table public.settings drop constraint if exists settings_provision_bps_check;
alter table public.settings
  add constraint settings_provision_bps_check
  check (provision_bps between 0 and 10000);

-- Abattement de 10 % des revenus de remplacement : taux, minimum et
-- plafond, revalorisés chaque année comme le barème, donc stockés et
-- jamais codés en dur. Décote : seuils, bases et taux, même raison.
alter table public.settings add column if not exists salary_abatement jsonb;
alter table public.settings add column if not exists decote jsonb;

alter table public.settings drop column if exists charge_rate_bps;

create table if not exists public.declarations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Premier jour de la période déclarée : un mois, ou le premier mois
  -- du trimestre.
  period       date not null,
  periodicity  text not null check (periodicity in ('monthly', 'quarterly')),
  -- Le chiffre d'affaires effectivement déclaré, par catégorie.
  declared_cents jsonb not null default '{}'::jsonb,
  -- Ce que l'URSSAF a appelé, et ce qui a été payé.
  called_cents integer,
  paid_cents   integer,
  paid_on      date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, period)
);

-- Activée tout de suite après la création, sans rien entre les deux :
-- l'éditeur SQL de Supabase inspecte le texte soumis et, s'il croit
-- voir une table créée sans RLS, il REECRIT le script pour y ajouter
-- lui-même des instructions.
alter table public.declarations enable row level security;

create index if not exists declarations_user_period_idx
  on public.declarations (user_id, period desc);

drop policy if exists declarations_owner on public.declarations;
create policy declarations_owner on public.declarations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists declarations_touch_updated_at on public.declarations;
create trigger declarations_touch_updated_at
  before update on public.declarations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. Garde-fous qui manquaient
-- ---------------------------------------------------------------------

-- Un montant négatif passait en base et retranchait du chiffre
-- d'affaires déclaré à l'URSSAF, sans que rien ne le signale. Une
-- charge se saisit avec direction = 'out', jamais avec un moins.
alter table public.entries drop constraint if exists entries_amounts_positive;
alter table public.entries
  add constraint entries_amounts_positive
  check (gross_cents >= 0 and fee_cents >= 0 and cost_cents >= 0);

-- `settings.updated_at` restait figée à la date du premier insert : le
-- trigger n'était posé que sur `entries`.
drop trigger if exists settings_touch_updated_at on public.settings;
create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();
