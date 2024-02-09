drop table if exists emojis;
drop table if exists emoji_aliases;
create table if not exists emojis (
  name text primary key,
  category text,
  url text not null,
  updated_at timestamp not null default current_timestamp
);

create table if not exists emoji_aliases (
  name text not null,
  alias text not null,
  primary key (name, alias)
);
