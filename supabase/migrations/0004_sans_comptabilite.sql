-- =====================================================================
--  La comptabilite quitte cette application
--
--  Elle suit et analyse des revenus, rien d'autre. La comptabilite du
--  micro-entrepreneur fera l'objet d'une application separee, avec son
--  propre modele.
--
--  Ce que ce fichier retire etait juste et fonctionnait. Il n'est pas
--  perdu : docs/fiscalite-reprise.md conserve en clair le regime, les
--  categories des quatre activites et les taux 2026, et l'historique
--  git garde l'implementation complete.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Le suivi des declarations URSSAF
--
-- Aucune ligne n'y avait ete enregistree.
-- ---------------------------------------------------------------------
drop table if exists public.declarations;

-- ---------------------------------------------------------------------
-- 2. Les reglages fiscaux
--
-- Debut d'activite, ACRE, versement liberatoire, parts, autres revenus,
-- bareme, decote, abattement des revenus de remplacement, periodicite
-- de declaration. Plus rien ne les lit.
-- ---------------------------------------------------------------------
alter table public.settings drop constraint if exists settings_urssaf_period_check;
alter table public.settings drop constraint if exists settings_tax_parts_check;

alter table public.settings drop column if exists activity_start;
alter table public.settings drop column if exists acre_enabled;
alter table public.settings drop column if exists versement_liberatoire;
alter table public.settings drop column if exists tax_parts;
alter table public.settings drop column if exists other_income_cents;
alter table public.settings drop column if exists tax_brackets;
alter table public.settings drop column if exists tax_brackets_year;
alter table public.settings drop column if exists urssaf_period;
alter table public.settings drop column if exists salary_abatement;
alter table public.settings drop column if exists decote;

-- ---------------------------------------------------------------------
-- 3. La categorie fiscale des activites
--
-- L'analyse des revenus se passe de fiscalite : la NATURE de l'activite
-- (revente, prestation, abonnement, allocation) suffit a distinguer ce
-- qui se regagne chaque mois de ce qui tombe tout seul, et c'est la
-- seule distinction dont les trois horizons ont besoin.
-- ---------------------------------------------------------------------
alter table public.streams drop constraint if exists streams_fiscal_category_check;
alter table public.streams drop column if exists fiscal_category;
alter table public.streams drop column if exists fiscal_confirmed;

-- ---------------------------------------------------------------------
-- 4. Les mentions du livre des recettes
--
-- Mode de reglement et reference de piece justificative n'ont de sens
-- que pour un livre des recettes opposable. Sans comptabilite, ce sont
-- deux champs que plus personne ne remplit, donc deux champs qui se
-- perimeraient en silence.
-- ---------------------------------------------------------------------
alter table public.entries drop constraint if exists entries_payment_method_check;
alter table public.entries drop column if exists payment_method;
alter table public.entries drop column if exists reference;

-- ---------------------------------------------------------------------
-- Ce qui reste, et pourquoi
--
--   entries.settle_locked  une mise en attente faite a la main ne doit
--                          pas etre defaite par la confirmation
--                          automatique au chargement suivant
--   entries.cost_cents     le cout d'achat sert au taux de marge, qui
--                          est une question de revenu, pas d'impot
--   entries.meta           reservee a la charge utile d'un import
--   entries_amounts_positive  un montant negatif reste une erreur de
--                          saisie, quelle que soit l'application
-- ---------------------------------------------------------------------
