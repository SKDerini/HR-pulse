-- Обновление существующей базы HR Строяков 2.0 до версии 2.1.
-- Выполнять после database/001_hr_stroyakov_v2.sql.

begin;

create index if not exists hr_records_offers_date_idx on app.hr_records((payload ->> 'offerDate')) where entity = 'offers';
create index if not exists hr_records_offers_employee_idx on app.hr_records(employee_id) where entity = 'offers';
create index if not exists hr_records_offer_versions_idx on app.hr_records((payload ->> 'offerId'), (payload ->> 'versionNumber')) where entity = 'offer_motivation_versions';
create unique index if not exists hr_records_offer_version_unique_idx on app.hr_records((payload ->> 'offerId'), (payload ->> 'versionNumber')) where entity = 'offer_motivation_versions';

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

create or replace function app.record_visible(p_entity text, p_employee_id text, p_department text, p_email text, p_payload jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = app, pg_temp
as $$
declare current_role text := app.current_hr_role();
begin
  if current_role is null then return false; end if;
  if current_role in ('HR', 'HRD') then return true; end if;
  if p_entity in ('offers', 'offer_motivation_versions', 'offer_events') then return false; end if;
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

insert into app.hr_records(entity, record_id, payload)
values ('settings', 'Версия системы', '{"parameter":"Версия системы","value":"2.1.0","comment":"Не редактировать","usage":"Система"}'::jsonb)
on conflict(entity, record_id) do update
set payload = jsonb_set(app.hr_records.payload, '{value}', '"2.1.0"'::jsonb), updated_at = now();

commit;
