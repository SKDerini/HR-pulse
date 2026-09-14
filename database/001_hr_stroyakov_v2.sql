-- HR Строяков 2.2 для Layero PostgreSQL / Data API.
-- Выполняется один раз в SQL-редакторе базы Layero.

begin;

create schema if not exists app;
create schema if not exists api;

create table if not exists app.hr_records (
  entity text not null,
  record_id text not null,
  employee_id text not null default '',
  manager_id text not null default '',
  department text not null default '',
  period text not null default '',
  record_date date,
  email text not null default '',
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (entity, record_id)
);

create index if not exists hr_records_entity_period_idx on app.hr_records(entity, period);
create index if not exists hr_records_entity_employee_idx on app.hr_records(entity, employee_id);
create index if not exists hr_records_entity_department_idx on app.hr_records(entity, department);
create index if not exists hr_records_entity_email_idx on app.hr_records(entity, lower(email));
create index if not exists hr_records_employee_manager_idx on app.hr_records(manager_id) where entity = 'employees';
create index if not exists hr_records_payload_gin_idx on app.hr_records using gin(payload jsonb_path_ops);
create index if not exists hr_records_offers_date_idx on app.hr_records((payload ->> 'offerDate')) where entity = 'offers';
create index if not exists hr_records_offers_employee_idx on app.hr_records(employee_id) where entity = 'offers';
create index if not exists hr_records_offer_versions_idx on app.hr_records((payload ->> 'offerId'), (payload ->> 'versionNumber')) where entity = 'offer_motivation_versions';
create unique index if not exists hr_records_offer_version_unique_idx on app.hr_records((payload ->> 'offerId'), (payload ->> 'versionNumber')) where entity = 'offer_motivation_versions';
create index if not exists hr_records_employee_imports_date_idx on app.hr_records((payload ->> 'importedAt')) where entity = 'employee_imports';
create index if not exists hr_records_employee_import_rows_idx on app.hr_records((payload ->> 'importId'), employee_id) where entity = 'employee_import_rows';

create table if not exists app.hr_user_roles (
  email text primary key,
  role text not null check (role in ('HRD', 'HR', 'Руководитель', 'Табельщик')),
  employee_id text not null default '',
  active boolean not null default true,
  comment text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists app.hr_ingest_tokens (
  name text primary key,
  token_hash text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

revoke all on schema app from public;
revoke all on all tables in schema app from public;

create or replace function app.jwt_email()
returns text
language sql
stable
as $$
  select lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''));
$$;

create or replace function app.current_hr_role()
returns text
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select role from app.hr_user_roles where email = app.jwt_email() and active limit 1;
$$;

create or replace function app.current_employee_id()
returns text
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select employee_id from app.hr_user_roles where email = app.jwt_email() and active limit 1;
$$;

create or replace function app.validate_hr_record()
returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
declare amount_value numeric;
begin
  if tg_op = 'DELETE' then
    if old.entity = 'offer_motivation_versions' then raise exception 'offer_motivation_history_is_immutable'; end if;
    return old;
  end if;
  if new.entity = 'offers' then
    if coalesce(trim(new.payload ->> 'fullName'), '') = ''
      or coalesce(trim(new.payload ->> 'department'), '') = ''
      or coalesce(trim(new.payload ->> 'position'), '') = ''
      or coalesce(trim(new.payload ->> 'offerDate'), '') = '' then
      raise exception 'offer_required_fields_missing';
    end if;
    begin amount_value := (new.payload ->> 'amount')::numeric; exception when others then raise exception 'offer_amount_invalid'; end;
    if amount_value < 0 then raise exception 'offer_amount_invalid'; end if;
  end if;
  if new.entity = 'offer_motivation_versions' then
    if tg_op = 'UPDATE' and new.payload is distinct from old.payload then raise exception 'offer_motivation_history_is_immutable'; end if;
    if coalesce(trim(new.payload ->> 'offerId'), '') = ''
      or coalesce(trim(new.payload ->> 'versionNumber'), '') = ''
      or coalesce(trim(new.payload ->> 'title'), '') = ''
      or coalesce(trim(new.payload ->> 'effectiveFrom'), '') = '' then
      raise exception 'offer_motivation_required_fields_missing';
    end if;
    if jsonb_typeof(coalesce(new.payload -> 'items', 'null'::jsonb)) <> 'array' or jsonb_array_length(new.payload -> 'items') = 0 then
      raise exception 'offer_motivation_items_required';
    end if;
    if not exists(select 1 from app.hr_records r where r.entity = 'offers' and r.record_id = new.payload ->> 'offerId') then
      raise exception 'offer_not_found';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists hr_records_validate_trigger on app.hr_records;
create trigger hr_records_validate_trigger
before insert or update or delete on app.hr_records
for each row execute function app.validate_hr_record();

create or replace function app.is_subordinate(p_employee_id text, p_root_manager_id text, p_recursive boolean default true)
returns boolean
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  with recursive team as (
    select r.record_id
    from app.hr_records r
    where r.entity = 'employees' and r.manager_id = p_root_manager_id
    union all
    select child.record_id
    from app.hr_records child
    join team parent on child.manager_id = parent.record_id
    where child.entity = 'employees' and p_recursive
  )
  select exists(select 1 from team where record_id = p_employee_id);
$$;

create or replace function app.timesheet_employee_allowed(p_employee_id text, p_department text)
returns boolean
language plpgsql
stable
security definer
set search_path = app, pg_temp
as $$
declare
  access_row record;
  access_scope text;
begin
  if app.current_hr_role() in ('HR', 'HRD') then return true; end if;
  for access_row in
    select payload from app.hr_records
    where entity = 'timesheet_access'
      and lower(email) = app.jwt_email()
      and coalesce((payload ->> 'active')::boolean, true)
  loop
    access_scope := coalesce(access_row.payload ->> 'accessScope', 'Подразделение');
    if access_scope = 'Подразделение' and coalesce(access_row.payload ->> 'department', '') = coalesce(p_department, '') then return true; end if;
    if access_scope = 'Выбранные сотрудники' and coalesce(access_row.payload -> 'employeeIds', '[]'::jsonb) ? p_employee_id then return true; end if;
    if access_scope = 'Прямые подчиненные' and app.is_subordinate(p_employee_id, access_row.payload ->> 'managerId', false) then return true; end if;
    if access_scope = 'Все подчиненные' and app.is_subordinate(p_employee_id, access_row.payload ->> 'managerId', true) then return true; end if;
  end loop;
  if app.current_hr_role() = 'Руководитель' and app.current_employee_id() <> '' then
    return app.is_subordinate(p_employee_id, app.current_employee_id(), true);
  end if;
  return false;
end;
$$;

create or replace function app.record_visible(p_entity text, p_employee_id text, p_department text, p_email text, p_payload jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = app, pg_temp
as $$
declare
  current_role text := app.current_hr_role();
begin
  if current_role is null then return false; end if;
  if current_role in ('HR', 'HRD') then return true; end if;
  if p_entity in ('offers', 'offer_motivation_versions', 'offer_events', 'employee_imports', 'employee_import_rows') then return false; end if;
  if p_entity = 'roles' then return lower(p_email) = app.jwt_email(); end if;
  if p_entity in ('directory_items', 'settings', 'adaptation_templates', 'work_calendar', 'timesheet_codes') then return true; end if;
  if current_role = 'Табельщик' then
    if p_entity not in ('employees', 'timesheet_entries', 'timesheet_periods', 'timesheet_differences', 'skud_controls', 'timesheet_access') then return false; end if;
    if p_entity = 'timesheet_access' then return lower(p_email) = app.jwt_email(); end if;
    if p_employee_id = '' then return p_entity = 'timesheet_periods'; end if;
    return app.timesheet_employee_allowed(p_employee_id, p_department);
  end if;
  if current_role = 'Руководитель' then
    if p_entity = 'vacancies' then return coalesce(p_payload ->> 'managerId', '') = app.current_employee_id(); end if;
    if p_entity in ('candidates', 'skud_imports') then return false; end if;
    if p_employee_id = '' then return false; end if;
    return app.is_subordinate(p_employee_id, app.current_employee_id(), true);
  end if;
  return false;
end;
$$;

create or replace function app.record_write_allowed(p_entity text, p_employee_id text, p_department text)
returns boolean
language plpgsql
stable
security definer
set search_path = app, pg_temp
as $$
declare current_role text := app.current_hr_role();
begin
  if current_role = 'HRD' then return true; end if;
  if current_role = 'HR' then return p_entity not in ('roles', 'settings', 'adaptation_templates', 'work_calendar', 'timesheet_access'); end if;
  if current_role = 'Руководитель' then
    return p_entity in ('adaptations', 'learning', 'surveys', 'timesheet_entries')
      and app.is_subordinate(p_employee_id, app.current_employee_id(), true);
  end if;
  if current_role = 'Табельщик' then
    return p_entity in ('timesheet_entries', 'timesheet_differences', 'skud_controls')
      and app.timesheet_employee_allowed(p_employee_id, p_department);
  end if;
  return false;
end;
$$;

create or replace function app.set_user_role(
  p_email text,
  p_role text,
  p_employee_id text default '',
  p_active boolean default true,
  p_comment text default ''
)
returns void
language plpgsql
security definer
set search_path = app, pg_temp
as $$
declare normalized_email text := lower(trim(p_email));
declare body jsonb;
begin
  if normalized_email = '' or position('@' in normalized_email) = 0 then raise exception 'Некорректный email'; end if;
  if p_role not in ('HRD', 'HR', 'Руководитель', 'Табельщик') then raise exception 'Некорректная роль'; end if;
  insert into app.hr_user_roles(email, role, employee_id, active, comment, updated_at)
  values(normalized_email, p_role, coalesce(p_employee_id, ''), p_active, coalesce(p_comment, ''), now())
  on conflict(email) do update set role = excluded.role, employee_id = excluded.employee_id, active = excluded.active, comment = excluded.comment, updated_at = now();
  body := jsonb_build_object('email', normalized_email, 'role', p_role, 'employeeId', coalesce(p_employee_id, ''), 'active', p_active, 'comment', coalesce(p_comment, ''));
  insert into app.hr_records(entity, record_id, employee_id, email, payload, updated_at, updated_by)
  values('roles', normalized_email, coalesce(p_employee_id, ''), normalized_email, body, now(), app.jwt_email())
  on conflict(entity, record_id) do update set employee_id = excluded.employee_id, email = excluded.email, payload = excluded.payload, version = app.hr_records.version + 1, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

create or replace function app.set_ingest_token(p_name text, p_token text, p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = app, pg_temp
as $$
begin
  if length(coalesce(p_token, '')) < 24 then raise exception 'Токен должен содержать не менее 24 символов'; end if;
  insert into app.hr_ingest_tokens(name, token_hash, active, updated_at)
  values(trim(p_name), md5(p_token), p_active, now())
  on conflict(name) do update set token_hash = excluded.token_hash, active = excluded.active, updated_at = now();
end;
$$;

create or replace function api.hr_query(p_entity text, p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = app, api, pg_temp
as $$
  select coalesce(jsonb_agg(
    case when app.current_hr_role() = 'Руководитель' then r.payload - 'hrComment' else r.payload end
    order by r.updated_at, r.record_id
  ), '[]'::jsonb)
  from app.hr_records r
  where r.entity = p_entity
    and app.record_visible(r.entity, r.employee_id, r.department, r.email, r.payload)
    and (not (p_filters ? 'recordId') or r.record_id = p_filters ->> 'recordId')
    and (not (p_filters ? 'employeeId') or r.employee_id = p_filters ->> 'employeeId')
    and (not (p_filters ? 'managerId') or r.manager_id = p_filters ->> 'managerId')
    and (not (p_filters ? 'department') or r.department = p_filters ->> 'department')
    and (not (p_filters ? 'period') or r.period = p_filters ->> 'period')
    and (not (p_filters ? 'email') or lower(r.email) = lower(p_filters ->> 'email'));
$$;

create or replace function api.hr_record_upsert(p_entity text, p_record_id text, p_payload jsonb, p_indexes jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, api, pg_temp
as $$
declare
  employee_id_value text := coalesce(p_indexes ->> 'employeeId', p_payload ->> 'employeeId', '');
  manager_id_value text := coalesce(p_indexes ->> 'managerId', p_payload ->> 'managerId', '');
  department_value text := coalesce(p_indexes ->> 'department', p_payload ->> 'department', '');
  period_value text := coalesce(p_indexes ->> 'period', p_payload ->> 'period', '');
  email_value text := lower(coalesce(p_indexes ->> 'email', p_payload ->> 'email', ''));
  date_value date;
  safe_payload jsonb := p_payload;
begin
  if p_record_id is null or trim(p_record_id) = '' then raise exception 'record_id_required'; end if;
  if not app.record_write_allowed(p_entity, employee_id_value, department_value) then raise exception 'access_denied'; end if;
  if p_entity = 'roles' then
    if app.current_hr_role() <> 'HRD' then raise exception 'access_denied'; end if;
    perform app.set_user_role(email_value, p_payload ->> 'role', employee_id_value, coalesce((p_payload ->> 'active')::boolean, true), coalesce(p_payload ->> 'comment', ''));
    return p_payload;
  end if;
  if app.current_hr_role() not in ('HR', 'HRD') then
    safe_payload := safe_payload - 'hrComment' - 'timesheetExclusionConfirmedBy' - 'timesheetExclusionConfirmedAt';
  end if;
  begin date_value := nullif(coalesce(p_indexes ->> 'recordDate', p_payload ->> 'date', p_payload ->> 'planDate', ''), '')::date; exception when others then date_value := null; end;
  insert into app.hr_records(entity, record_id, employee_id, manager_id, department, period, record_date, email, payload, version, updated_at, updated_by)
  values(p_entity, p_record_id, employee_id_value, manager_id_value, department_value, period_value, date_value, email_value, safe_payload, 1, now(), app.jwt_email())
  on conflict(entity, record_id) do update set
    employee_id = excluded.employee_id,
    manager_id = excluded.manager_id,
    department = excluded.department,
    period = excluded.period,
    record_date = excluded.record_date,
    email = excluded.email,
    payload = case when app.current_hr_role() in ('HR', 'HRD') then excluded.payload else excluded.payload || jsonb_strip_nulls(jsonb_build_object(
      'hrComment', app.hr_records.payload -> 'hrComment',
      'timesheetExclusionConfirmedBy', app.hr_records.payload -> 'timesheetExclusionConfirmedBy',
      'timesheetExclusionConfirmedAt', app.hr_records.payload -> 'timesheetExclusionConfirmedAt'
    )) end,
    version = app.hr_records.version + 1,
    updated_at = now(),
    updated_by = app.jwt_email();
  return safe_payload;
end;
$$;

create or replace function api.hr_records_bulk_upsert(p_entity text, p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, api, pg_temp
as $$
declare item jsonb;
declare result jsonb := '[]'::jsonb;
begin
  if jsonb_array_length(coalesce(p_records, '[]'::jsonb)) > 3000 then raise exception 'batch_too_large'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    result := result || jsonb_build_array(api.hr_record_upsert(p_entity, item ->> 'recordId', item -> 'payload', coalesce(item -> 'indexes', '{}'::jsonb)));
  end loop;
  return result;
end;
$$;

create or replace function api.hr_record_delete(p_entity text, p_record_id text)
returns boolean
language plpgsql
security definer
set search_path = app, api, pg_temp
as $$
begin
  if app.current_hr_role() <> 'HRD' then raise exception 'access_denied'; end if;
  delete from app.hr_records where entity = p_entity and record_id = p_record_id;
  return found;
end;
$$;

create or replace function api.hr_submit_survey(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = app, api, pg_temp
as $$
declare
  response_id text := coalesce(nullif(p_payload ->> 'responseId', ''), 'RSP-EXT-' || substr(md5(clock_timestamp()::text || random()::text), 1, 12));
  safe_payload jsonb;
begin
  if not exists(select 1 from app.hr_ingest_tokens where active and token_hash = md5(coalesce(p_token, ''))) then raise exception 'invalid_form_token'; end if;
  if coalesce(p_payload ->> 'type', '') = '' then raise exception 'survey_type_required'; end if;
  safe_payload := (p_payload - 'hrComment') || jsonb_build_object('responseId', response_id, 'source', coalesce(nullif(p_payload ->> 'source', ''), 'Внешняя форма'));
  insert into app.hr_records(entity, record_id, employee_id, department, record_date, payload, updated_at, updated_by)
  values('surveys', response_id, coalesce(safe_payload ->> 'employeeId', ''), coalesce(safe_payload ->> 'department', ''), coalesce(nullif(safe_payload ->> 'date', '')::date, current_date), safe_payload, now(), 'external-form')
  on conflict(entity, record_id) do nothing;
  return safe_payload;
end;
$$;

grant usage on schema api to layero.role('auth');
grant usage on schema api to layero.role('anon');
grant execute on function api.hr_query(text, jsonb) to layero.role('auth');
grant execute on function api.hr_record_upsert(text, text, jsonb, jsonb) to layero.role('auth');
grant execute on function api.hr_records_bulk_upsert(text, jsonb) to layero.role('auth');
grant execute on function api.hr_record_delete(text, text) to layero.role('auth');
grant execute on function api.hr_submit_survey(text, jsonb) to layero.role('anon');
grant execute on function api.hr_submit_survey(text, jsonb) to layero.role('auth');

-- Безопасные базовые записи. Пользовательские HR-данные скрипт не создает.
insert into app.hr_records(entity, record_id, payload)
values
  ('settings', 'Версия системы', '{"parameter":"Версия системы","value":"2.2.0","comment":"Не редактировать","usage":"Система"}'::jsonb),
  ('settings', 'Цель eNPS', '{"parameter":"Цель eNPS","value":"40","comment":"Зеленая зона","usage":"Опросы"}'::jsonb),
  ('timesheet_codes', 'Я', '{"code":"Я","name":"Явка","category":"Явка","color":"#FFF2CC","defaultHours":8,"requiresDocument":false,"active":true,"order":10}'::jsonb),
  ('timesheet_codes', 'В', '{"code":"В","name":"Выходной","category":"Выходной","color":"#FFFFFF","defaultHours":0,"requiresDocument":false,"active":true,"order":20}'::jsonb),
  ('timesheet_codes', 'Б', '{"code":"Б","name":"Больничный","category":"Отсутствие","color":"#00B0F0","defaultHours":0,"requiresDocument":true,"active":true,"order":30}'::jsonb),
  ('timesheet_codes', 'У', '{"code":"У","name":"Учебный отпуск","category":"Отсутствие","color":"#C6E0B4","defaultHours":0,"requiresDocument":true,"active":true,"order":40}'::jsonb),
  ('timesheet_codes', 'ОТ', '{"code":"ОТ","name":"Ежегодный отпуск","category":"Отсутствие","color":"#FCE4D6","defaultHours":0,"requiresDocument":true,"active":true,"order":50}'::jsonb),
  ('timesheet_codes', 'ДО', '{"code":"ДО","name":"Отпуск без сохранения","category":"Отсутствие","color":"#F4B183","defaultHours":0,"requiresDocument":true,"active":true,"order":60}'::jsonb),
  ('timesheet_codes', 'И', '{"code":"И","name":"Иное отсутствие","category":"Отсутствие","color":"#FFE699","defaultHours":0,"requiresDocument":false,"active":true,"order":70}'::jsonb)
on conflict(entity, record_id) do nothing;

update app.hr_records
set payload = jsonb_set(payload, '{value}', '"2.2.0"'::jsonb), updated_at = now()
where entity = 'settings' and record_id = 'Версия системы';

commit;

-- После регистрации первого пользователя выполните отдельно, заменив email:
-- select app.set_user_role('you@example.ru', 'HRD', '', true, 'Первый администратор');
