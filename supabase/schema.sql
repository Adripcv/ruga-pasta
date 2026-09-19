-- ============================================================================
-- RUGA PASTA — Schéma Click & Collect (Supabase / Postgres)
--
-- À coller dans Supabase → SQL Editor → New query → Run.
-- Idempotent : peut être ré-exécuté sans casser les données (le seed utilise
-- ON CONFLICT pour rester à jour).
--
-- PRINCIPE DE SÉCURITÉ
--   RLS (Row Level Security) est activé sur TOUTES les tables, AUCUNE policy
--   n'est créée : anon et authenticated n'ont donc accès à AUCUNE table
--   directement depuis le navigateur, même avec la clé `anon`. Toutes les
--   lectures/écritures passent par les fonctions API (serverless), qui
--   utilisent la clé `service_role` — jamais exposée au client.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- MENU — arbre produit/groupes (miroir de la carte affichée sur le site)
-- ---------------------------------------------------------------------------
create table if not exists public.menu_nodes (
  id           text primary key,
  parent_id    text references public.menu_nodes(id) on delete cascade,
  name         text not null,
  kind         text not null default 'item'
               check (kind in ('root', 'group', 'item')),
  -- Prix unitaire en CENTIMES. `null` = noeud de regroupement non commandable.
  price_cents  integer check (price_cents is null or price_cents >= 0),
  max_qty      integer not null default 1 check (max_qty between 1 and 20),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  sold_out     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Le contenu publié = la branche active sous la racine « menu ».
create index if not exists menu_nodes_parent_idx
  on public.menu_nodes (parent_id, sort_order);

-- ---------------------------------------------------------------------------
-- RÉGLAGES du click & collect (une seule ligne, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.store_settings (
  id                  integer primary key default 1 check (id = 1),
  ordering_enabled    boolean not null default true,
  ordering_message    text,
  slot_minutes        integer not null default 15 check (slot_minutes between 5 and 60),
  prep_delay_minutes  integer not null default 20 check (prep_delay_minutes between 0 and 240),
  open_minutes        integer not null default 660,  -- 11:00
  close_minutes       integer not null default 1260, -- 21:00
  capacity_per_slot   integer not null default 6 check (capacity_per_slot between 1 and 100),
  closed_weekdays     integer[] not null default '{0}', -- 0 = dimanche
  admin_notify_email  text,          -- email du gérant pour les notifications
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- COMMANDES
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                -- « RUGA-7K2M »
  customer_name text not null,
  customer_phone text not null,                      -- E.164 normalisé (+33…)
  pickup_at     timestamptz not null,                -- début du créneau (UTC)
  pickup_end_at timestamptz not null,
  status        text not null default 'new'
                check (status in ('new','preparing','ready','picked_up','cancelled')),
  total_cents   integer not null check (total_cents > 0),
  -- Prêt pour le paiement en ligne (phase 4) : 'unpaid' | 'paid' | 'refunded'.
  payment_status text not null default 'unpaid'
                check (payment_status in ('unpaid','paid','refunded')),
  note          text,                                -- remarque client facultative
  -- Anti-spam / traçabilité (sans jamais stocker d'IP exploitable côté client).
  client_key    text not null,                       -- empreinte IP hachée + sel
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Cohérence : le créneau DOIT finir après son début.
  check (pickup_end_at > pickup_at)
);

create index if not exists orders_pickup_idx
  on public.orders (pickup_at desc);
create index if not exists orders_status_idx
  on public.orders (status, pickup_at);
create index if not exists orders_phone_idx on public.orders (customer_phone);

-- Lignes de commande — le prix est FIGÉ au moment de la commande (l'historique
-- reste juste même si la carte change ensuite).
create table if not exists public.order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  node_id     text not null references public.menu_nodes(id),
  name        text not null,
  path        text[] not null default '{}',          -- chemin de groupes (ticket)
  unit_cents  integer not null check (unit_cents >= 0),
  qty         integer not null check (qty between 1 and 20),
  line_cents  integer not null check (line_cents >= 0)
);

create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- RLS : tout interdire aux rôles client (anon / authenticated)
-- ---------------------------------------------------------------------------
alter table public.menu_nodes     enable row level security;
alter table public.store_settings enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;

-- Aucune policy = aucun accès direct. (service_role contourne RLS par design.)

-- ---------------------------------------------------------------------------
-- VERROUS D'APPLICATION — validations métier que SQL ne peut pas deviner
-- ---------------------------------------------------------------------------
-- Les bornes horaires, la capacité des créneaux et le délai de préparation
-- sont vérifiés dans la fonction `create_order` ci-dessous (transactionnelle).

-- ---------------------------------------------------------------------------
-- FONCTION ATOMIQUE : create_order
--
-- Garantit, dans UNE transaction :
--   1. les prix sont recalculés depuis menu_nodes (jamais lus dans le payload) ;
--   2. le créneau existe, est dans le futur, respecte le délai de préparation ;
--   3. la capacité du créneau n'est pas dépassée — via un verrou consultatif
--      sur le créneau : deux clients simultanés sur le dernier créneau, un
--      seul gagne, l'autre reçoit 'SLOT_FULL'.
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_customer_name text,
  p_customer_phone text,
  p_pickup_at timestamptz,
  p_items jsonb,          -- [{"id": "box-s", "qty": 2}, …]
  p_note text default null,
  p_client_key text default ''
)
returns jsonb
language plpgsql
as $$
declare
  v_settings   public.store_settings%rowtype;
  v_pickup_end timestamptz;
  v_now        timestamptz := now();
  v_total      integer := 0;
  v_item       jsonb;
  v_node       public.menu_nodes%rowtype;
  v_path       text[];
  v_count      integer;
  v_order_id   uuid;
  v_code       text;
  v_lines      jsonb := '[]'::jsonb;
begin
  -- (0) Réglages — une seule ligne.
  select * into v_settings from public.store_settings where id = 1;
  if not found then
    return jsonb_build_object('error', 'STORE_NOT_CONFIGURED');
  end if;
  if not v_settings.ordering_enabled then
    return jsonb_build_object('error', 'ORDERING_CLOSED',
      'message', coalesce(v_settings.ordering_message,
        'La commande en ligne est momentanément fermée.'));
  end if;

  -- (1) Le créneau doit être un multiple de slot_minutes à partir de l'ouverture.
  --     « minutes depuis minuit à Paris » du créneau demandé :
  declare
    v_minutes int;
    v_weekday int; -- index style JS getDay() : 0 = dimanche … 6 = samedi
  begin
    v_minutes := extract(hour from p_pickup_at at time zone 'Europe/Paris') * 60
               + extract(minute from p_pickup_at at time zone 'Europe/Paris');
    if (v_minutes - v_settings.open_minutes) % v_settings.slot_minutes <> 0
       or v_minutes < v_settings.open_minutes
       or v_minutes + v_settings.slot_minutes > v_settings.close_minutes then
      return jsonb_build_object('error', 'BAD_SLOT');
    end if;
    v_pickup_end := p_pickup_at + make_interval(mins => v_settings.slot_minutes);

    -- (2) Jour de fermeture hebdomadaire ? isodow : 1 = lundi … 7 = dimanche,
    --     donc l'index JS s'obtient par `isodow % 7` (dimanche → 0).
    v_weekday := extract(isodow from p_pickup_at at time zone 'Europe/Paris')::int % 7;
    if v_settings.closed_weekdays @> array[v_weekday] then
      return jsonb_build_object('error', 'CLOSED_DAY',
        'message', 'Fermé ce jour-là — choisis un autre jour.');
    end if;
  end;

  -- (3) Délai de préparation + pas dans le passé.
  if p_pickup_at < v_now + make_interval(mins => v_settings.prep_delay_minutes) then
    return jsonb_build_object('error', 'SLOT_TOO_SOON',
      'message', 'Ce créneau est trop tôt — le temps de préparer ta commande.');
  end if;

  -- (4) VERROU du créneau : sérialise les commandes visant le même créneau.
  --     pg_advisory_xact_lock : libéré automatiquement à la fin de la
  --     transaction, sans deadlock possible avec une seule clé par créneau.
  perform pg_advisory_xact_lock(
    hashtext('ruga-slot-' || to_char(p_pickup_at at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI'))
  );

  select count(*) into v_count
  from public.orders
  where pickup_at = p_pickup_at
    and status <> 'cancelled';
  if v_count >= v_settings.capacity_per_slot then
    return jsonb_build_object('error', 'SLOT_FULL',
      'message', 'Ce créneau est complet — choisis-en un autre.');
  end if;

  -- (5) Prix : recalcul serveur. On lit menu_nodes, JAMAIS le payload.
  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item ? 'id' and jsonb_typeof(v_item->'qty') = 'number'
       and (v_item->>'qty')::int between 1 and 20 then
      select * into v_node from public.menu_nodes
      where id = v_item->>'id' and is_active and not sold_out
        and price_cents is not null;
      if not found then
        return jsonb_build_object('error', 'UNKNOWN_ITEM',
          'message', 'Article indisponible : ' || coalesce(v_item->>'id', '?'));
      end if;
      if (v_item->>'qty')::int > v_node.max_qty then
        return jsonb_build_object('error', 'QTY_LIMIT',
          'message', 'Quantité maximale atteinte pour ' || v_node.name || '.');
      end if;
      -- Chemin de groupes (pour le ticket) : remonte parent_id par parent_id.
      with recursive ancestors as (
        select id, parent_id, name, 0 as depth from public.menu_nodes where id = v_node.id
        union all
        select p.id, p.parent_id, p.name, a.depth + 1
        from public.menu_nodes p join ancestors a on p.id = a.parent_id
      )
      select array_agg(name order by depth desc) into v_path from ancestors;

      v_total := v_total + v_node.price_cents * (v_item->>'qty')::int;
      v_lines := v_lines || jsonb_build_object(
        'node_id', v_node.id, 'name', v_node.name, 'path', v_path,
        'unit_cents', v_node.price_cents, 'qty', (v_item->>'qty')::int,
        'line_cents', v_node.price_cents * (v_item->>'qty')::int);
    else
      return jsonb_build_object('error', 'BAD_ITEM');
    end if;
  end loop;

  if v_total <= 0 then
    return jsonb_build_object('error', 'EMPTY_TOTAL');
  end if;
  if jsonb_array_length(p_items) > 40 then
    return jsonb_build_object('error', 'CART_TOO_BIG');
  end if;

  -- (6) Code commande lisible, unique en base (collision → retry côté appelant).
  loop
    v_code := 'RUGA-' || substr(
      translate(encode(gen_random_bytes(8), 'base64'), '+=/', 'AAA'), 1, 4);
    v_code := upper(regexp_replace(v_code, '[01ILO]', 'g', 'i'));
    exit when not exists (select 1 from public.orders where code = v_code);
  end loop;

  -- (7) Insertion — transactionnelle avec le verrou ci-dessus.
  insert into public.orders (code, customer_name, customer_phone, pickup_at,
                             pickup_end_at, total_cents, note, client_key)
  values (v_code, p_customer_name, p_customer_phone, p_pickup_at,
          v_pickup_end, v_total, nullif(trim(coalesce(p_note, '')), ''), p_client_key)
  returning id into v_order_id;

  insert into public.order_items (order_id, node_id, name, path, unit_cents, qty, line_cents)
  select v_order_id,
         (line->>'node_id'), (line->>'name'),
         (select array_agg(x) from jsonb_array_elements_text(line->'path') x),
         (line->>'unit_cents')::int, (line->>'qty')::int, (line->>'line_cents')::int
  from jsonb_array_elements(v_lines) as line;

  return jsonb_build_object('ok', true, 'order_id', v_order_id, 'code', v_code,
                            'total_cents', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- SEED — arbre du menu (miroir de src/data/restaurant.ts) + réglages
-- ---------------------------------------------------------------------------
insert into public.menu_nodes (id, parent_id, name, kind, price_cents, max_qty, sort_order)
values
  ('menu',        null,    'Menu',                    'root', null, 1, 0),

  ('box',         'menu',  'Compose ta box',          'group', null, 1, 10),
  ('box-s',       'box',   'Box S',                   'item', 650, 10, 10),
  ('box-m',       'box',   'Box M',                   'item', 850, 10, 20),
  ('pates',       'box-s', 'Pâtes',                   'group', null, 1, 10),
  ('pates-fusilli','pates','Fusilli',                 'item', 0,   1, 10),
  ('pates-penne', 'pates', 'Penne',                   'item', 0,   1, 20),
  ('pates-farfalle','pates','Farfalle',               'item', 0,   1, 30),
  ('sauces',      'box-s', 'Sauces',                  'group', null, 1, 20),
  ('sauce-tomate','sauces','Tomate',                  'item', 0,   1, 10),
  ('sauce-bolo',  'sauces','Bolognaise',              'item', 0,   1, 20),
  ('sauce-poulet','sauces','Poulet Curry',            'item', 0,   1, 30),
  ('sauce-carbo', 'sauces','Carbonara',               'item', 0,   1, 40),
  ('sauce-pesto', 'sauces','Pesto',                   'item', 0,   1, 50),

  ('formules',    'menu',  'Formules',                'group', null, 1, 20),
  ('f-classique-s','formules','Formule Classique S',  'item', 790, 10, 10),
  ('f-classique-m','formules','Formule Classique M',  'item', 990, 10, 20),
  ('f-gourmande-s','formules','Formule Gourmande S',  'item', 990, 10, 30),
  ('f-gourmande-m','formules','Formule Gourmande M',  'item', 1190, 10, 40),

  ('salade',      'menu',  'Salade de pâtes de la semaine', 'item', 950, 5, 30),

  ('boissons',    'menu',  'Boissons',                'group', null, 1, 40),
  ('boisson-eau', 'boissons','Cristalline / San Pellegrino 50cL', 'item', 150, 5, 10),
  ('boisson-coca','boissons','Coca-Cola / Zéro 33cL', 'item', 200, 5, 20),
  ('boisson-soda','boissons','Orangina / Fuze Tea / Oasis 33cL', 'item', 200, 5, 30),

  ('desserts',    'menu',  'Desserts',                'group', null, 1, 50),
  ('dess-cookie', 'desserts','Cookies',               'item', 300, 5, 10),
  ('dess-donut',  'desserts','Donuts',                'item', 300, 5, 20),
  ('dess-fb',     'desserts','Fromage blanc',         'item', 300, 5, 30),
  ('dess-tiramisu','desserts','Tiramisu',             'item', 400, 5, 40)
on conflict (id) do update
  set parent_id = excluded.parent_id,
      name = excluded.name,
      kind = excluded.kind,
      price_cents = excluded.price_cents,
      max_qty = excluded.max_qty,
      sort_order = excluded.sort_order;

-- Réglages initiaux (ne touche pas les colonnes modifiées par le gérant
-- si la ligne existe déjà).
insert into public.store_settings (id) values (1)
on conflict (id) do nothing;
