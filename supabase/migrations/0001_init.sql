-- =====================================================================
--  Revenus — schéma initial
--
--  Principe central : un revenu a DEUX dates.
--    occurred_on : quand la vente / prestation a eu lieu  (comptabilisé)
--    received_on : quand l'argent est réellement arrivé   (encaissé)
--  Une vente Vinted conclue le 28 septembre mais versée le 3 octobre
--  compte en septembre côté "comptabilisé" et en octobre côté "encaissé".
--  Tous les agrégats se calculent sur l'une OU l'autre selon la base
--  choisie dans l'interface.
--
--  Les montants sont stockés en CENTIMES (entiers) : jamais de flottant
--  sur de l'argent.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Activités (streams)
-- ---------------------------------------------------------------------
create table if not exists public.streams (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  key         text not null,
  name        text not null,
  -- pilote les métriques affichées sur la page de l'activité
  kind        text not null default 'other'
              check (kind in ('resale', 'service', 'subscription', 'benefit', 'other')),
  -- 1..8 → slot de la palette catégorielle (l'ordre des slots est le
  -- mécanisme de sûreté daltonisme, il ne se réattribue pas au hasard)
  color_slot  smallint not null default 1 check (color_slot between 1 and 8),
  icon        text not null default 'circle',
  -- Délai habituel entre la vente et le versement, en jours. Sert à
  -- pré-remplir la date d'encaissement prévue : on ne saisit jamais
  -- cette date à la main, on la corrige seulement quand elle est fausse.
  settlement_days smallint not null default 0 check (settlement_days between 0 and 365),
  -- Quand le versement est fiable (Vinted, prélèvement SaaS, allocation),
  -- l'encaissement se confirme tout seul à la date prévue. Sinon
  -- l'écriture attend une confirmation d'un clic.
  auto_settle boolean not null default false,
  position    smallint not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);

-- ---------------------------------------------------------------------
-- Écritures : revenus et charges
-- ---------------------------------------------------------------------
create table if not exists public.entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  stream_id     uuid references public.streams (id) on delete cascade,

  direction     text not null default 'in' check (direction in ('in', 'out')),
  label         text not null default '',

  -- in  : gross = prix de vente / facture / allocation
  -- out : gross = montant de la charge
  gross_cents   integer not null default 0,
  -- commission plateforme, frais Stripe, frais de port non refacturés
  fee_cents     integer not null default 0,
  -- coût d'acquisition : prix d'achat de l'article, sous-traitance
  cost_cents    integer not null default 0,

  occurred_on   date not null,
  -- Date d'encaissement PRÉVUE, calculée depuis le délai de l'activité.
  -- C'est elle qui alimente le calendrier des rentrées à venir.
  expected_on   date,
  -- Date d'encaissement RÉELLE. null tant que l'argent n'est pas arrivé.
  received_on   date,
  status        text not null default 'pending'
                check (status in ('pending', 'received', 'cancelled')),

  quantity      integer not null default 1 check (quantity > 0),
  counterparty  text,
  notes         text,
  tags          text[] not null default '{}',
  meta          jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- une écriture encaissée a forcément une date d'encaissement, et
  -- inversement : l'état et la date ne peuvent pas diverger
  constraint entries_received_coherent check (
    (status = 'received' and received_on is not null)
    or (status <> 'received' and received_on is null)
  )
);

-- ---------------------------------------------------------------------
-- Objectifs mensuels
-- ---------------------------------------------------------------------
create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- premier jour du mois visé ; stream_id null = objectif tous revenus
  month        date not null,
  stream_id    uuid references public.streams (id) on delete cascade,
  target_cents integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, month, stream_id)
);

-- objectif global : une seule ligne par mois. UNIQUE laisse passer les
-- doublons quand stream_id est NULL (NULL <> NULL), d'où cet index.
create unique index if not exists goals_global_month_uniq
  on public.goals (user_id, month)
  where stream_id is null;

-- ---------------------------------------------------------------------
-- Préférences
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  currency         text not null default 'EUR',
  -- 'cash' (encaissé) ou 'accrual' (comptabilisé)
  default_basis    text not null default 'cash' check (default_basis in ('cash', 'accrual')),
  -- taux de cotisations estimé, en points de base (2200 = 22 %)
  charge_rate_bps  integer not null default 0,
  fiscal_year_start smallint not null default 1 check (fiscal_year_start between 1 and 12),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Index — les agrégats balayent par date et par activité
-- ---------------------------------------------------------------------
create index if not exists entries_user_received_idx on public.entries (user_id, received_on);
create index if not exists entries_user_occurred_idx on public.entries (user_id, occurred_on);
create index if not exists entries_user_stream_idx   on public.entries (user_id, stream_id);
create index if not exists entries_user_status_idx   on public.entries (user_id, status);
create index if not exists entries_user_expected_idx on public.entries (user_id, expected_on)
  where status = 'pending';


-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at
  before update on public.entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS — chacun ne voit que ses propres lignes.
-- L'app est mono-utilisateur : même si un autre compte parvenait à se
-- créer, il tomberait sur une app vide, jamais sur ces données.
-- ---------------------------------------------------------------------
alter table public.streams  enable row level security;
alter table public.entries  enable row level security;
alter table public.goals    enable row level security;
alter table public.settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['streams', 'entries', 'goals'] loop
    execute format('drop policy if exists %I_owner on public.%I', t, t);
    execute format(
      'create policy %I_owner on public.%I
         for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t, t);
  end loop;
end
$$;

drop policy if exists settings_owner on public.settings;
create policy settings_owner on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Amorçage : à la création du compte, les quatre activités et les
-- préférences par défaut sont posées, l'app n'est jamais vide.
-- ---------------------------------------------------------------------
create or replace function public.seed_new_user()
returns trigger
language plpgsql
security definer
-- search_path vide : une fonction SECURITY DEFINER qui résout ses noms
-- via le search_path de l'appelant est détournable. Tout est qualifié.
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.streams
    (user_id, key, name, kind, color_slot, icon, settlement_days, auto_settle, position)
  -- Délai à zéro et confirmation automatique partout : à l'usage
  -- courant, chaque montant est saisi une fois qu'il est déjà encaissé.
  -- Le délai se règle activité par activité le jour où des ventes sont
  -- enregistrées avant leur versement (client facturé à 30 jours,
  -- import automatique des ventes Vinted).
  values
    (new.id, 'vinted',  'Vinted',            'resale',       1, 'tag',       0, true, 0),
    (new.id, 'web',     'Création de sites', 'service',      2, 'code',      0, true, 1),
    (new.id, 'saas',    'SaaS',              'subscription', 3, 'repeat',    0, true, 2),
    (new.id, 'chomage', 'Allocation chômage','benefit',      4, 'umbrella',  0, true, 3)
  on conflict (user_id, key) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_new_user();

-- ---------------------------------------------------------------------
-- Verrouillage des fonctions de trigger
--
-- PostgREST expose toute fonction du schéma public en /rpc/. Ces deux-là
-- ne servent que de corps de trigger — et seed_new_user tourne en
-- SECURITY DEFINER — donc personne ne doit pouvoir les appeler depuis
-- l'API. Le moteur de triggers, lui, ne passe pas par ces droits.
-- ---------------------------------------------------------------------
revoke all on function public.seed_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
