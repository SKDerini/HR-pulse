-- Безопасное обновление HR Строяков 2.1 -> 2.2.
-- Добавляет журнал импорта сотрудников и закрывает его от руководителей/табельщиков.

begin;

create index if not exists hr_records_employee_imports_date_idx
on app.hr_records((payload ->> 'importedAt'))
where entity = 'employee_imports';

create index if not exists hr_records_employee_import_rows_idx
on app.hr_records((payload ->> 'importId'), employee_id)
where entity = 'employee_import_rows';

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

insert into app.hr_records(entity, record_id, payload)
values ('settings', 'Версия системы', '{"parameter":"Версия системы","value":"2.2.0","comment":"Не редактировать","usage":"Система"}'::jsonb)
on conflict(entity, record_id) do update
set payload = jsonb_set(app.hr_records.payload, '{value}', '"2.2.0"'::jsonb),
    version = app.hr_records.version + 1,
    updated_at = now(),
    updated_by = app.jwt_email();

commit;
