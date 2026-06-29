export const INITIAL_MIGRATION_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY,
  root_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS objectives (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  dir_path TEXT NOT NULL,
  parent_objective_id INTEGER REFERENCES objectives(id) ON DELETE SET NULL,
  parent_task_id TEXT,
  version INTEGER NOT NULL DEFAULT 3,
  title TEXT NOT NULL,
  kind TEXT,
  tranche TEXT,
  status TEXT NOT NULL,
  active_task_id TEXT,
  first_milestone_complete INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS objective_intake (
  objective_id INTEGER PRIMARY KEY REFERENCES objectives(id) ON DELETE CASCADE,
  original_request TEXT,
  interpreted_outcome TEXT,
  input_shape TEXT,
  audience TEXT,
  authority TEXT,
  proof_type TEXT,
  completion_proof TEXT,
  likely_misfire TEXT,
  blind_spots_considered_json TEXT,
  existing_plan_facts_json TEXT
);

CREATE TABLE IF NOT EXISTS objective_success_criteria (
  objective_id INTEGER PRIMARY KEY REFERENCES objectives(id) ON DELETE CASCADE,
  signal TEXT NOT NULL,
  cadence TEXT,
  final_proof TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS objective_rules (
  objective_id INTEGER PRIMARY KEY REFERENCES objectives(id) ON DELETE CASCADE,
  pm_owns_state INTEGER,
  one_active_task INTEGER,
  max_write_workers INTEGER,
  no_implementation_without_worker_or_pm_task INTEGER,
  no_completion_without_approval_gate_or_pm_audit INTEGER,
  planning_is_not_completion INTEGER,
  queued_required_worker_blocks_completion INTEGER,
  continuous_until_full_outcome INTEGER,
  missing_input_or_credentials_do_not_stop_objective INTEGER,
  preserve_and_validate_existing_plan INTEGER,
  intake_misfire_must_be_audited INTEGER,
  goal_pressure_requires_success_criteria INTEGER,
  no_completion_on_weak_proof INTEGER,
  slice_policy_json TEXT,
  extra_json TEXT
);

CREATE TABLE IF NOT EXISTS objective_agents (
  objective_id INTEGER PRIMARY KEY REFERENCES objectives(id) ON DELETE CASCADE,
  scout TEXT NOT NULL,
  worker TEXT NOT NULL,
  approval_gate TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS objective_visual_board (
  objective_id INTEGER PRIMARY KEY REFERENCES objectives(id) ON DELETE CASCADE,
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS objective_checks (
  objective_id INTEGER PRIMARY KEY REFERENCES objectives(id) ON DELETE CASCADE,
  dirty_fingerprint TEXT,
  last_verification_json TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  assignee TEXT NOT NULL,
  status TEXT NOT NULL,
  reasoning_hint TEXT,
  objective_text TEXT NOT NULL,
  receipt_json TEXT,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (objective_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_list_items (
  objective_id INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  list_name TEXT NOT NULL,
  position INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (objective_id, task_id, list_name, position),
  FOREIGN KEY (objective_id, task_id) REFERENCES tasks(objective_id, task_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subobjective_links (
  parent_objective_id INTEGER NOT NULL,
  parent_task_id TEXT NOT NULL,
  child_objective_id INTEGER NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 1,
  owner TEXT,
  created_from TEXT,
  rollup_receipt_json TEXT,
  PRIMARY KEY (parent_objective_id, parent_task_id),
  FOREIGN KEY (parent_objective_id, parent_task_id) REFERENCES tasks(objective_id, task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_objectives_slug ON objectives(slug);
CREATE INDEX IF NOT EXISTS idx_objectives_workspace_slug ON objectives(workspace_id, slug);
CREATE INDEX IF NOT EXISTS idx_tasks_objective_status ON tasks(objective_id, status);
CREATE INDEX IF NOT EXISTS idx_subobjective_links_child ON subobjective_links(child_objective_id);
`;
