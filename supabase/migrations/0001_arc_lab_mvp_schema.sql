create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key,
  phone text unique,
  role text not null check (role in ('coach', 'student', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists organizations (
  id uuid primary key,
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  organization_id uuid references organizations(id),
  profile_id uuid references profiles(id),
  role text not null check (role in ('owner', 'coach', 'student', 'admin')),
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

create table if not exists athletes (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  display_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists coach_athlete_relations (
  coach_id uuid not null references profiles(id),
  athlete_id uuid not null references athletes(id),
  organization_id uuid not null references organizations(id),
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id)
);

create table if not exists athlete_invites (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  athlete_id uuid not null references athletes(id),
  coach_id uuid not null references profiles(id),
  token text not null unique,
  expires_at timestamptz,
  phone_bound_at timestamptz,
  bound_profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists problem_tags (
  id text primary key,
  label_zh text not null,
  category text not null,
  primary_view text not null check (primary_view in ('side', 'front', 'back')),
  related_signal_ids jsonb not null default '[]'::jsonb
);

create table if not exists drill_library (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  category text not null check (category in ('correction', 'transfer', 'retest')),
  purpose text,
  related_problem_tag_ids jsonb not null default '[]'::jsonb,
  related_signal_ids jsonb not null default '[]'::jsonb,
  default_dosage text,
  coaching_cues jsonb not null default '[]'::jsonb,
  success_metric text,
  required_view text check (required_view in ('side', 'front', 'back')),
  safety_boundary text,
  source_obsidian_path text,
  source_rule_cards jsonb not null default '[]'::jsonb
);

create table if not exists training_sessions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  athlete_id uuid not null references athletes(id),
  coach_id uuid references profiles(id),
  source_type text not null check (source_type in ('coach_lesson', 'athlete_homework')),
  uploaded_by_role text not null check (uploaded_by_role in ('coach', 'athlete')),
  initial_problem_tag_id text references problem_tags(id),
  shot_type text not null check (shot_type in ('spot_up', 'catch_and_shoot', 'pull_up_after_dribble', 'stop_jump', 'free_throw')),
  camera_view text not null check (camera_view in ('side', 'front', 'back')),
  linked_task_id uuid,
  visibility_to_athlete boolean not null default true,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists video_assets (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  athlete_id uuid not null references athletes(id),
  session_id uuid not null references training_sessions(id),
  storage_provider text not null,
  object_key text not null,
  camera_view text not null check (camera_view in ('side', 'front', 'back')),
  shot_type text not null,
  uploaded_by uuid references profiles(id),
  retention_until timestamptz,
  deleted_at timestamptz
);

create table if not exists evidence_packets (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  session_id uuid not null references training_sessions(id),
  packet_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_report_drafts (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  session_id uuid not null references training_sessions(id),
  draft_json jsonb not null,
  student_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists coach_feedback (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  session_id uuid not null references training_sessions(id),
  coach_id uuid not null references profiles(id),
  final_feedback_json jsonb not null,
  published_at timestamptz
);

create table if not exists training_task_drafts (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  session_id uuid not null references training_sessions(id),
  coach_id uuid not null references profiles(id),
  athlete_id uuid not null references athletes(id),
  ai_draft_json jsonb not null,
  final_published_json jsonb,
  diff_json jsonb,
  source_candidate_ids jsonb not null default '[]'::jsonb,
  status text not null
);

create table if not exists training_tasks (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  athlete_id uuid not null references athletes(id),
  coach_id uuid not null references profiles(id),
  session_id uuid references training_sessions(id),
  status text not null check (status in ('assigned', 'started', 'completed_by_self_report', 'retest_uploaded', 'coach_reviewed', 'effective', 'ineffective', 'watching')),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists training_plan_steps (
  id uuid primary key,
  training_task_id uuid not null references training_tasks(id),
  drill_id uuid references drill_library(id),
  step_type text not null check (step_type in ('correction', 'transfer', 'retest')),
  step_order int not null,
  dosage text,
  cue text,
  success_target text
);

create table if not exists training_plan_step_results (
  id uuid primary key,
  training_task_id uuid not null references training_tasks(id),
  drill_id uuid references drill_library(id),
  step_type text not null check (step_type in ('correction', 'transfer', 'retest')),
  effectiveness_status text not null check (effectiveness_status in ('effective', 'ineffective', 'watching', 'unrated')),
  coach_note text
);

create table if not exists session_problem_tags (
  session_id uuid not null references training_sessions(id),
  problem_tag_id text not null references problem_tags(id),
  role text not null check (role in ('primary', 'secondary')),
  source text not null check (source in ('coach_confirmed', 'evidence_suggested', 'ai_search')),
  status text not null check (status in ('suggested', 'confirmed', 'rejected')),
  coach_note text,
  primary key (session_id, problem_tag_id, role, source)
);

create table if not exists athlete_metric_snapshots (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  athlete_id uuid not null references athletes(id),
  session_id uuid not null references training_sessions(id),
  source_type text not null,
  camera_view text not null,
  shot_type text not null,
  problem_tag_id text not null references problem_tags(id),
  metric_id text not null,
  metric_value numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists trend_explanation_drafts (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  athlete_id uuid not null references athletes(id),
  draft_json jsonb not null,
  coach_confirmed_json jsonb,
  student_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists knowledge_articles (
  id uuid primary key,
  slug text not null unique,
  title text not null,
  category text not null,
  student_summary text,
  student_body text,
  related_problem_tag_ids jsonb not null default '[]'::jsonb,
  related_drill_ids jsonb not null default '[]'::jsonb,
  source_type text,
  source_path text,
  visible_to_students boolean not null default true
);

create table if not exists knowledge_assistant_usage (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  athlete_id uuid not null references athletes(id),
  usage_date date not null,
  ai_answer_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, athlete_id, usage_date)
);

create table if not exists notifications (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  profile_id uuid not null references profiles(id),
  level text not null check (level in ('normal', 'important')),
  reason text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists coach_athlete_flags (
  coach_id uuid not null references profiles(id),
  athlete_id uuid not null references athletes(id),
  organization_id uuid not null references organizations(id),
  flag text not null,
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id, flag)
);

create table if not exists audit_events (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  actor_profile_id uuid references profiles(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists consents (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  athlete_id uuid references athletes(id),
  consent_type text not null,
  status text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table athletes add column if not exists deleted_at timestamptz;
alter table athletes add column if not exists deleted_by uuid references profiles(id);
alter table training_sessions add column if not exists deleted_at timestamptz;
alter table training_sessions add column if not exists deleted_by uuid references profiles(id);
alter table video_assets add column if not exists deleted_by uuid references profiles(id);

create or replace function public.arc_lab_current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

create or replace function public.arc_lab_is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = target_organization_id
      and profile_id = auth.uid()
  )
$$;

create or replace function public.arc_lab_is_org_coach(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = target_organization_id
      and profile_id = auth.uid()
      and role in ('owner', 'coach', 'admin')
  )
$$;

create or replace function public.arc_lab_is_bound_athlete(target_organization_id uuid, target_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from athlete_invites
    where organization_id = target_organization_id
      and athlete_id = target_athlete_id
      and bound_profile_id = auth.uid()
      and phone_bound_at is not null
  )
$$;

create or replace function public.arc_lab_storage_org_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when object_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/' then split_part(object_name, '/', 1)::uuid
    else null
  end
$$;

create or replace function public.arc_lab_storage_athlete_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when object_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/' then split_part(object_name, '/', 2)::uuid
    else null
  end
$$;

create or replace function public.arc_lab_can_manage_storage_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from athletes
    where athletes.id = public.arc_lab_storage_athlete_id(object_name)
      and athletes.organization_id = public.arc_lab_storage_org_id(object_name)
      and public.arc_lab_is_org_coach(athletes.organization_id)
  )
$$;

create or replace function public.arc_lab_can_read_storage_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.arc_lab_can_manage_storage_path(object_name)
    or exists (
      select 1
      from video_assets
      join training_sessions on training_sessions.id = video_assets.session_id
      where video_assets.object_key = object_name
        and video_assets.organization_id = public.arc_lab_storage_org_id(object_name)
        and video_assets.athlete_id = public.arc_lab_storage_athlete_id(object_name)
        and video_assets.deleted_at is null
        and training_sessions.deleted_at is null
        and training_sessions.visibility_to_athlete is true
        and public.arc_lab_is_bound_athlete(video_assets.organization_id, video_assets.athlete_id)
    )
$$;

alter table profiles enable row level security;
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table coach_athlete_relations enable row level security;
alter table athletes enable row level security;
alter table athlete_invites enable row level security;
alter table problem_tags enable row level security;
alter table drill_library enable row level security;
alter table training_sessions enable row level security;
alter table video_assets enable row level security;
alter table evidence_packets enable row level security;
alter table ai_report_drafts enable row level security;
alter table coach_feedback enable row level security;
alter table training_task_drafts enable row level security;
alter table training_tasks enable row level security;
alter table training_plan_steps enable row level security;
alter table training_plan_step_results enable row level security;
alter table session_problem_tags enable row level security;
alter table athlete_metric_snapshots enable row level security;
alter table trend_explanation_drafts enable row level security;
alter table knowledge_articles enable row level security;
alter table knowledge_assistant_usage enable row level security;
alter table notifications enable row level security;
alter table coach_athlete_flags enable row level security;
alter table audit_events enable row level security;
alter table consents enable row level security;

create policy profiles_select_self on profiles for select using (id = auth.uid());
create policy profiles_update_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_select_members on organizations for select using (public.arc_lab_is_org_member(id));
create policy organizations_insert_owner on organizations for insert with check (created_by = auth.uid());
create policy organizations_update_coaches on organizations for update using (public.arc_lab_is_org_coach(id)) with check (public.arc_lab_is_org_coach(id));

create policy organization_members_select_same_org on organization_members for select using (public.arc_lab_is_org_member(organization_id));
create policy organization_members_manage_coaches on organization_members for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy coach_athlete_relations_select_same_org on coach_athlete_relations for select using (public.arc_lab_is_org_member(organization_id));
create policy coach_athlete_relations_manage_coaches on coach_athlete_relations for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy athletes_select_coach_or_bound_student on athletes for select using (public.arc_lab_is_org_coach(organization_id) or public.arc_lab_is_bound_athlete(organization_id, id));
create policy athletes_manage_coaches on athletes for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy athlete_invites_select_coaches on athlete_invites for select using (public.arc_lab_is_org_coach(organization_id));
create policy athlete_invites_manage_coaches on athlete_invites for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy problem_tags_select_authenticated on problem_tags for select using (auth.uid() is not null);
create policy drill_library_select_authenticated on drill_library for select using (auth.uid() is not null);

create policy training_sessions_select_coach_or_bound_student on training_sessions for select using (
  deleted_at is null
  and (
    public.arc_lab_is_org_coach(organization_id)
    or (visibility_to_athlete is true and public.arc_lab_is_bound_athlete(organization_id, athlete_id))
  )
);
create policy training_sessions_manage_coaches on training_sessions for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy video_assets_select_coach_or_bound_student on video_assets for select using (
  deleted_at is null
  and (
    public.arc_lab_is_org_coach(organization_id)
    or exists (
      select 1
      from training_sessions
      where training_sessions.id = video_assets.session_id
        and training_sessions.deleted_at is null
        and training_sessions.visibility_to_athlete is true
        and public.arc_lab_is_bound_athlete(video_assets.organization_id, video_assets.athlete_id)
    )
  )
);
create policy video_assets_manage_coaches on video_assets for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy evidence_packets_select_coaches on evidence_packets for select using (public.arc_lab_is_org_coach(organization_id));
create policy evidence_packets_manage_coaches on evidence_packets for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy ai_report_drafts_select_coaches_only on ai_report_drafts for select using (public.arc_lab_is_org_coach(organization_id));
create policy ai_report_drafts_manage_coaches_only on ai_report_drafts for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy coach_feedback_select_coach_or_bound_student on coach_feedback for select using (
  public.arc_lab_is_org_coach(organization_id)
  or (
    coach_feedback.published_at is not null
    and exists (
      select 1
      from training_sessions
      where training_sessions.id = coach_feedback.session_id
        and training_sessions.deleted_at is null
        and training_sessions.visibility_to_athlete is true
        and public.arc_lab_is_bound_athlete(training_sessions.organization_id, training_sessions.athlete_id)
    )
  )
);
create policy coach_feedback_manage_coaches on coach_feedback for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy training_task_drafts_select_coaches_only on training_task_drafts for select using (public.arc_lab_is_org_coach(organization_id));
create policy training_task_drafts_manage_coaches_only on training_task_drafts for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy training_tasks_select_coach_or_bound_student on training_tasks for select using (
  public.arc_lab_is_org_coach(organization_id)
  or (
    training_tasks.published_at is not null
    and public.arc_lab_is_bound_athlete(organization_id, athlete_id)
  )
);
create policy training_tasks_manage_coaches on training_tasks for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy training_plan_steps_select_task_viewers on training_plan_steps for select using (
  exists (
    select 1
    from training_tasks
    where training_tasks.id = training_plan_steps.training_task_id
      and (
        public.arc_lab_is_org_coach(training_tasks.organization_id)
        or (
          training_tasks.published_at is not null
          and public.arc_lab_is_bound_athlete(training_tasks.organization_id, training_tasks.athlete_id)
        )
      )
  )
);
create policy training_plan_steps_manage_coaches on training_plan_steps for all using (
  exists (
    select 1
    from training_tasks
    where training_tasks.id = training_plan_steps.training_task_id
      and public.arc_lab_is_org_coach(training_tasks.organization_id)
  )
) with check (
  exists (
    select 1
    from training_tasks
    where training_tasks.id = training_plan_steps.training_task_id
      and public.arc_lab_is_org_coach(training_tasks.organization_id)
  )
);

create policy training_plan_step_results_select_coaches on training_plan_step_results for select using (
  exists (
    select 1
    from training_tasks
    where training_tasks.id = training_plan_step_results.training_task_id
      and public.arc_lab_is_org_coach(training_tasks.organization_id)
  )
);
create policy training_plan_step_results_manage_coaches on training_plan_step_results for all using (
  exists (
    select 1
    from training_tasks
    where training_tasks.id = training_plan_step_results.training_task_id
      and public.arc_lab_is_org_coach(training_tasks.organization_id)
  )
) with check (
  exists (
    select 1
    from training_tasks
    where training_tasks.id = training_plan_step_results.training_task_id
      and public.arc_lab_is_org_coach(training_tasks.organization_id)
  )
);

create policy session_problem_tags_select_session_viewers on session_problem_tags for select using (
  exists (
    select 1
    from training_sessions
    where training_sessions.id = session_problem_tags.session_id
      and (
        public.arc_lab_is_org_coach(training_sessions.organization_id)
        or (session_problem_tags.source = 'coach_confirmed' and public.arc_lab_is_bound_athlete(training_sessions.organization_id, training_sessions.athlete_id))
      )
  )
);
create policy session_problem_tags_manage_coaches on session_problem_tags for all using (
  exists (
    select 1
    from training_sessions
    where training_sessions.id = session_problem_tags.session_id
      and public.arc_lab_is_org_coach(training_sessions.organization_id)
  )
) with check (
  exists (
    select 1
    from training_sessions
    where training_sessions.id = session_problem_tags.session_id
      and public.arc_lab_is_org_coach(training_sessions.organization_id)
  )
);

create policy athlete_metric_snapshots_select_coach_or_bound_student on athlete_metric_snapshots for select using (
  public.arc_lab_is_org_coach(organization_id)
  or public.arc_lab_is_bound_athlete(organization_id, athlete_id)
);
create policy athlete_metric_snapshots_manage_coaches on athlete_metric_snapshots for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy trend_explanation_drafts_select_coach_or_confirmed_student on trend_explanation_drafts for select using (
  public.arc_lab_is_org_coach(organization_id)
  or (student_visible is true and coach_confirmed_json is not null and public.arc_lab_is_bound_athlete(organization_id, athlete_id))
);
create policy trend_explanation_drafts_manage_coaches on trend_explanation_drafts for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy knowledge_articles_select_students_cleaned on knowledge_articles for select using (visible_to_students is true and auth.uid() is not null);
create policy knowledge_articles_manage_coaches on knowledge_articles for all using (
  exists (
    select 1
    from organization_members
    where profile_id = auth.uid()
      and role in ('owner', 'coach', 'admin')
  )
) with check (
  exists (
    select 1
    from organization_members
    where profile_id = auth.uid()
      and role in ('owner', 'coach', 'admin')
  )
);

create policy knowledge_assistant_usage_select_coach_or_bound_student on knowledge_assistant_usage for select using (
  public.arc_lab_is_org_coach(organization_id)
  or public.arc_lab_is_bound_athlete(organization_id, athlete_id)
);
create policy knowledge_assistant_usage_manage_bound_student on knowledge_assistant_usage for all using (public.arc_lab_is_bound_athlete(organization_id, athlete_id)) with check (public.arc_lab_is_bound_athlete(organization_id, athlete_id));

create policy notifications_select_own on notifications for select using (profile_id = auth.uid() and public.arc_lab_is_org_member(organization_id));
create policy notifications_manage_coaches on notifications for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

create policy coach_athlete_flags_select_owner_coach on coach_athlete_flags for select using (coach_id = auth.uid() and public.arc_lab_is_org_member(organization_id));
create policy coach_athlete_flags_manage_owner_coach on coach_athlete_flags for all using (coach_id = auth.uid() and public.arc_lab_is_org_coach(organization_id)) with check (coach_id = auth.uid() and public.arc_lab_is_org_coach(organization_id));

create policy audit_events_select_coaches on audit_events for select using (public.arc_lab_is_org_coach(organization_id));
create policy audit_events_insert_org_members on audit_events for insert with check (actor_profile_id = auth.uid() and public.arc_lab_is_org_member(organization_id));

create policy consents_select_coach_or_bound_student on consents for select using (
  public.arc_lab_is_org_coach(organization_id)
  or (athlete_id is not null and public.arc_lab_is_bound_athlete(organization_id, athlete_id))
);
create policy consents_manage_coaches on consents for all using (public.arc_lab_is_org_coach(organization_id)) with check (public.arc_lab_is_org_coach(organization_id));

insert into storage.buckets (id, name, public)
values ('arc-lab-videos', 'arc-lab-videos', false)
on conflict (id) do update set public = false;

create policy arc_lab_videos_select_authorized_viewers on storage.objects for select using (
  bucket_id = 'arc-lab-videos'
  and public.arc_lab_can_read_storage_object(name)
);

create policy arc_lab_videos_insert_org_coaches on storage.objects for insert with check (
  bucket_id = 'arc-lab-videos'
  and public.arc_lab_can_manage_storage_path(name)
);

create policy arc_lab_videos_update_org_coaches on storage.objects for update using (
  bucket_id = 'arc-lab-videos'
  and public.arc_lab_can_manage_storage_path(name)
) with check (
  bucket_id = 'arc-lab-videos'
  and public.arc_lab_can_manage_storage_path(name)
);

create policy arc_lab_videos_delete_org_coaches on storage.objects for delete using (
  bucket_id = 'arc-lab-videos'
  and public.arc_lab_can_manage_storage_path(name)
);

create or replace function public.arc_lab_mark_video_deleted(target_video_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_asset video_assets%rowtype;
begin
  select * into target_asset from video_assets where id = target_video_asset_id;
  if not found then
    raise exception 'video_asset_not_found';
  end if;
  if not public.arc_lab_is_org_coach(target_asset.organization_id) then
    raise exception 'arc_lab_forbidden_video_delete';
  end if;

  update video_assets
  set deleted_at = now(), deleted_by = auth.uid()
  where id = target_video_asset_id;

  insert into audit_events (id, organization_id, actor_profile_id, action, target_type, target_id)
  values (gen_random_uuid(), target_asset.organization_id, auth.uid(), 'video_deleted', 'video_asset', target_video_asset_id::text);
end
$$;

create or replace function public.arc_lab_mark_session_deleted(target_training_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session training_sessions%rowtype;
begin
  select * into target_session from training_sessions where id = target_training_session_id;
  if not found then
    raise exception 'training_session_not_found';
  end if;
  if not public.arc_lab_is_org_coach(target_session.organization_id) then
    raise exception 'arc_lab_forbidden_session_delete';
  end if;

  update training_sessions
  set deleted_at = now(), deleted_by = auth.uid()
  where id = target_training_session_id;

  insert into audit_events (id, organization_id, actor_profile_id, action, target_type, target_id)
  values (gen_random_uuid(), target_session.organization_id, auth.uid(), 'session_deleted', 'training_session', target_training_session_id::text);
end
$$;

create or replace function public.arc_lab_mark_athlete_data_deleted(target_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_athlete athletes%rowtype;
begin
  select * into target_athlete from athletes where id = target_athlete_id;
  if not found then
    raise exception 'athlete_not_found';
  end if;
  if not public.arc_lab_is_org_coach(target_athlete.organization_id) then
    raise exception 'arc_lab_forbidden_athlete_data_delete';
  end if;

  update athletes
  set deleted_at = now(), deleted_by = auth.uid()
  where id = target_athlete_id;

  update training_sessions
  set deleted_at = now(), deleted_by = auth.uid()
  where athlete_id = target_athlete_id and organization_id = target_athlete.organization_id;

  update video_assets
  set deleted_at = now(), deleted_by = auth.uid()
  where athlete_id = target_athlete_id and organization_id = target_athlete.organization_id;

  insert into audit_events (id, organization_id, actor_profile_id, action, target_type, target_id)
  values (gen_random_uuid(), target_athlete.organization_id, auth.uid(), 'athlete_data_deleted', 'athlete', target_athlete_id::text);
end
$$;
