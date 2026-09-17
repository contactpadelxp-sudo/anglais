-- =====================================================================
--  Comptabilité — catégories fiscales et paramètres du foyer
--
--  Chaque activité reçoit une catégorie fiscale et sociale, qui pilote
--  son taux de cotisations, sa contribution à la formation et son
--  abattement. Deux points qu'on ne peut pas déduire du reste :
--
--   • l'allocation chômage n'est PAS soumise aux cotisations URSSAF,
--     mais elle EST intégralement imposable. Les deux règles sont
--     indépendantes — d'où une catégorie « remplacement » distincte,
--     et non une simple exclusion.
--
--   • l'assiette des cotisations est le chiffre d'affaires ENCAISSÉ
--     BRUT. Ni les frais ni le coût d'achat ne s'en déduisent : c'est
--     l'abattement forfaitaire qui tient lieu de prise en compte des
--     charges.
-- =====================================================================

alter table public.streams
  add column if not exists fiscal_category text not null default 'hors';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'streams_fiscal_category_check'
  ) then
    alter table public.streams
      add constraint streams_fiscal_category_check
      check (fiscal_category in (
        'bic_vente', 'bic_service', 'bnc', 'bnc_cipav', 'remplacement', 'hors'
      ));
  end if;
end
$$;

-- Paramètres du foyer et de l'exonération -----------------------------
alter table public.settings
  add column if not exists activity_start date,
  add column if not exists acre_enabled boolean not null default false,
  add column if not exists versement_liberatoire boolean not null default false,
  add column if not exists tax_parts numeric(4,2) not null default 1
    check (tax_parts >= 1 and tax_parts <= 20),
  add column if not exists other_income_cents integer not null default 0,
  -- Le barème est stocké plutôt que codé en dur : ses tranches sont
  -- revalorisées chaque année, et celui applicable aux revenus d'une
  -- année n'est connu qu'après coup.
  add column if not exists tax_brackets jsonb,
  add column if not exists tax_brackets_year text;

-- Rattachement des activités créées avant cette migration -------------
update public.streams set fiscal_category = 'bic_vente'
  where key = 'vinted' and fiscal_category = 'hors';

-- Sites et SaaS : la qualification dépend de l'activité réellement
-- exercée, pas d'une case cochée. On pose la valeur la plus probable
-- pour un développeur indépendant qui réalise lui-même ses prestations,
-- et l'interface signale qu'elle doit être confirmée.
update public.streams set fiscal_category = 'bnc'
  where key in ('web', 'saas') and fiscal_category = 'hors';

update public.streams set fiscal_category = 'remplacement'
  where key = 'chomage' and fiscal_category = 'hors';

-- L'amorçage d'un nouveau compte pose les mêmes catégories ------------
create or replace function public.seed_new_user()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.streams
    (user_id, key, name, kind, color_slot, icon, settlement_days, auto_settle, position,
     fiscal_category)
  values
    (new.id, 'vinted',  'Vinted',            'resale',       1, 'tag',      0, true, 0, 'bic_vente'),
    (new.id, 'web',     'Création de sites', 'service',      2, 'code',     0, true, 1, 'bnc'),
    (new.id, 'saas',    'SaaS',              'subscription', 3, 'repeat',   0, true, 2, 'bnc'),
    (new.id, 'chomage', 'Allocation chômage','benefit',      4, 'umbrella', 0, true, 3, 'remplacement')
  on conflict (user_id, key) do nothing;

  return new;
end;
$$;

revoke all on function public.seed_new_user() from public, anon, authenticated;
