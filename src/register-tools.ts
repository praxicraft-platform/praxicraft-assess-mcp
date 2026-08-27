// @ts-nocheck
import { z } from "zod";
import { appendQuery, listPath, publicPath, queryParams } from "./api-paths.js";
import { AssessClient } from "./client.js";
import { runTool } from "./tool-runner.js";

/** Cursor pagination shared by Public API list endpoints (default 20, max 100). */
const paginationArgs = {
  cursor: z
    .string()
    .optional()
    .describe("Opaque cursor from next_cursor / previous_cursor of a prior page"),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page (default 20, max 100)"),
};

export function registerAssessTools(server: any, client: AssessClient): void {
  function getBearerToken(extra: any): string | undefined {
    return extra?.authInfo?.token;
  }

  server.tool(
    "list_assessments",
    "List assessments for the organisation (all statuses by default; cursor-paginated)",
    {
      search: z.string().optional(),
      status: z.string().optional(),
      ...paginationArgs,
    },
    async ({ search, status, cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath(
            "assessments",
            queryParams({ search, status, cursor, page_size }),
          ),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "get_assessment",
    "Get assessment detail by slug",
    { slug: z.string() },
    async ({ slug }, extra) =>
      runTool(client, () => client.getWithBearer(publicPath("assessments", String(slug)), getBearerToken(extra))),
  );

  server.tool(
    "list_assessment_results",
    "List completed results for an assessment (cursor-paginated). Use next_cursor to fetch the next page.",
    {
      slug: z.string(),
      ...paginationArgs,
    },
    async ({ slug, cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          appendQuery(
            publicPath("assessments", String(slug), "results"),
            queryParams({ cursor, page_size }),
          ),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "create_assessment",
    "Create a draft assessment (attach tasks, then PATCH status to active)",
    {
      title: z.string(),
      description: z.string().optional(),
      time_limit_minutes: z.number().int().optional(),
      passing_score: z.number().int().optional(),
      team_id: z.string().uuid().optional(),
      pool_mode: z.boolean().optional(),
      assignment_size: z.number().int().optional(),
      shuffle_strategy: z
        .enum([
          "random",
          "balanced",
          "tag_balanced",
          "tag_difficulty_balanced",
          "track_balanced",
        ])
        .optional(),
      tag_quotas: z.record(z.number().int()).optional(),
      pool_settings: z.record(z.unknown()).optional(),
      enforce_fullscreen: z.boolean().optional(),
      copy_paste_disabled: z.boolean().optional(),
      session_recording_enabled: z.boolean().optional(),
      screen_recording_enabled: z.boolean().optional(),
      webcam_recording_enabled: z.boolean().optional(),
      notify_on_completion: z.boolean().optional(),
      violation_review_threshold: z.number().int().optional(),
    },
    async (body, extra) =>
      runTool(client, () =>
        client.postWithBearer(publicPath("assessments", "create"), body, getBearerToken(extra)),
      ),
  );

  server.tool(
    "update_assessment",
    "Update assessment metadata, status, proctoring, pool mode, or squad",
    {
      slug: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
      time_limit_minutes: z.number().int().optional(),
      passing_score: z.number().int().optional(),
      team_id: z.string().uuid().nullable().optional(),
      pool_mode: z.boolean().optional(),
      assignment_size: z.number().int().nullable().optional(),
      shuffle_strategy: z
        .enum([
          "random",
          "balanced",
          "tag_balanced",
          "tag_difficulty_balanced",
          "track_balanced",
        ])
        .optional(),
      tag_quotas: z.record(z.number().int()).optional(),
      pool_settings: z.record(z.unknown()).optional(),
      enforce_fullscreen: z.boolean().optional(),
      copy_paste_disabled: z.boolean().optional(),
      session_recording_enabled: z.boolean().optional(),
      screen_recording_enabled: z.boolean().optional(),
      webcam_recording_enabled: z.boolean().optional(),
      notify_on_completion: z.boolean().optional(),
      violation_review_threshold: z.number().int().optional(),
    },
    async ({ slug, ...body }, extra) =>
      runTool(client, () =>
        client.patchWithBearer(
          publicPath("assessments", String(slug), "update"),
          body,
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "duplicate_assessment",
    "Clone an assessment (settings + tasks) into a new draft",
    {
      slug: z.string(),
      title: z.string().optional(),
    },
    async ({ slug, title }, extra) =>
      runTool(client, () =>
        client.postWithBearer(
          publicPath("assessments", String(slug), "duplicate"),
          title !== undefined ? { title } : {},
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "list_assessment_tasks",
    "List tasks attached to an assessment (cursor-paginated)",
    {
      slug: z.string(),
      ...paginationArgs,
    },
    async ({ slug, cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          appendQuery(
            publicPath("assessments", String(slug), "tasks"),
            queryParams({ cursor, page_size }),
          ),
          getBearerToken(extra),
        ),
      ),
  );

  const assessmentTaskItem = z.object({
    task_id: z.string().uuid(),
    source: z.enum(["platform", "org"]).optional(),
    order: z.number().int().optional(),
    weight: z.number().int().optional(),
    time_limit_minutes: z.number().int().nullable().optional(),
  });

  server.tool(
    "attach_assessment_tasks",
    "Attach one or more tasks to an assessment (tasks array, or task_id + source)",
    {
      slug: z.string(),
      tasks: z.array(assessmentTaskItem).optional(),
      task_id: z.string().uuid().optional(),
      source: z.enum(["platform", "org"]).optional(),
    },
    async ({ slug, tasks, task_id, source }, extra) =>
      runTool(client, () =>
        client.postWithBearer(
          publicPath("assessments", String(slug), "tasks", "attach"),
          tasks !== undefined ? { tasks } : { task_id, source },
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "replace_assessment_tasks",
    "Replace the full task lineup on an assessment",
    {
      slug: z.string(),
      tasks: z.array(assessmentTaskItem),
    },
    async ({ slug, tasks }, extra) =>
      runTool(client, () =>
        client.putWithBearer(
          publicPath("assessments", String(slug), "tasks", "replace"),
          { tasks },
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "remove_assessment_task",
    "Remove a single attached task from an assessment",
    {
      slug: z.string(),
      assessment_task_id: z.string().uuid(),
    },
    async ({ slug, assessment_task_id }, extra) =>
      runTool(client, () =>
        client.deleteWithBearer(
          publicPath("assessments", String(slug), "tasks", "remove"),
          { assessment_task_id },
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "create_invite",
    "Create a single assessment invitation",
    {
      slug: z.string(),
      email: z.string().email(),
      name: z.string().optional(),
      role: z.string().optional(),
      send_email: z.boolean().optional(),
      expires_days: z.number().int().optional(),
    },
    async ({ slug, email, name, role, send_email, expires_days }, extra) =>
      runTool(client, () =>
        client.postWithBearer(
          publicPath("assessments", String(slug), "invites"),
          {
          email,
          name,
          role,
          send_email,
          expires_days,
          },
          getBearerToken(extra),
        )
      ),
  );

  server.tool(
    "bulk_invite",
    "Bulk create assessment invitations (skips duplicates)",
    {
      slug: z.string(),
      candidates: z.array(
        z.object({
          email: z.string().email(),
          name: z.string().optional(),
          role: z.string().optional(),
        }),
      ),
      expires_days: z.number().int().optional(),
      send_email: z.boolean().optional(),
    },
    async ({ slug, candidates, expires_days, send_email }, extra) =>
      runTool(client, () =>
        client.postWithBearer(
          publicPath("assessments", String(slug), "invites", "bulk"),
          {
          candidates,
          expires_days,
          send_email,
          },
          getBearerToken(extra),
        )
      ),
  );

  server.tool(
    "get_invite",
    "Get invitation status and metadata by token",
    { token: z.string().uuid() },
    async ({ token }, extra) =>
      runTool(client, () => client.getWithBearer(publicPath("invites", String(token)), getBearerToken(extra))),
  );

  server.tool(
    "remind_invite",
    "Send a reminder email for a pending invitation",
    { token: z.string().uuid() },
    async ({ token }, extra) =>
      runTool(client, () => client.postWithBearer(publicPath("invites", String(token), "remind"), undefined, getBearerToken(extra))),
  );

  server.tool(
    "get_invite_result",
    "Get detailed result for an invitation token",
    { token: z.string().uuid() },
    async ({ token }, extra) =>
      runTool(client, () => client.getWithBearer(publicPath("invites", String(token), "result"), getBearerToken(extra))),
  );

  server.tool(
    "list_invites",
    "List invitations across assessments (cursor-paginated)",
    {
      assessment: z.string().optional().describe("Filter by assessment slug"),
      status: z.string().optional(),
      ...paginationArgs,
    },
    async ({ assessment, status, cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath(
            "invites",
            queryParams({ assessment, status, cursor, page_size }),
          ),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "cancel_invite",
    "Cancel a pending invitation by token",
    { token: z.string().uuid() },
    async ({ token }, extra) =>
      runTool(client, () =>
        client.deleteWithBearer(publicPath("invites", String(token)), undefined, getBearerToken(extra)),
      ),
  );

  server.tool("get_org", "Get organisation profile and quota", {}, async (_args, extra) =>
    runTool(client, () => client.getWithBearer(publicPath("org"), getBearerToken(extra))),
  );

  server.tool(
    "list_audit_log",
    "List organisation compliance audit events (who did what, when; Starter+; cursor-paginated)",
    {
      action: z.string().optional(),
      channel: z.string().optional(),
      search: z.string().optional(),
      outcome: z.enum(["success", "error"]).optional(),
      since: z.string().optional(),
      until: z.string().optional(),
      exclude_dashboard: z.boolean().optional(),
      ...paginationArgs,
    },
    async (
      { action, channel, search, outcome, since, until, exclude_dashboard, cursor, page_size },
      extra,
    ) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath(
            "org/audit-log",
            queryParams({
              action,
              channel,
              search,
              outcome,
              since,
              until,
              exclude_dashboard:
                exclude_dashboard === undefined
                  ? undefined
                  : exclude_dashboard
                    ? "1"
                    : "0",
              cursor,
              page_size,
            }),
          ),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "get_org_stats",
    "Get aggregate organisation analytics",
    { team_slug: z.string().optional() },
    async ({ team_slug }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath("org/stats", queryParams({ team_slug })),
          getBearerToken(extra),
        )
      ),
  );

  server.tool(
    "list_squads",
    "List squads (Growth plan and above; cursor-paginated)",
    { ...paginationArgs },
    async ({ cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath("org/squads", queryParams({ cursor, page_size })),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "get_squad",
    "Get a hiring squad by id (Growth plan and above)",
    { team_id: z.string().uuid() },
    async ({ team_id }, extra) =>
      runTool(client, () =>
        client.getWithBearer(publicPath("org", "squads", String(team_id)), getBearerToken(extra)),
      ),
  );

  server.tool(
    "list_squad_members",
    "List members of a hiring squad (cursor-paginated; Growth+)",
    { team_id: z.string().uuid(), ...paginationArgs },
    async ({ team_id, cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath(`org/squads/${team_id}/members`, queryParams({ cursor, page_size })),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "list_org_team",
    "List organisation team members (cursor-paginated)",
    { ...paginationArgs },
    async ({ cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath("org/team", queryParams({ cursor, page_size })),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "list_platform_tasks",
    "Browse curated platform tasks (safe metadata; cursor-paginated)",
    {
      search: z.string().optional(),
      track: z.string().optional(),
      difficulty: z.string().optional(),
      type: z.string().optional(),
      ...paginationArgs,
    },
    async ({ search, track, difficulty, type, cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath(
            "platform-tasks",
            queryParams({ search, track, difficulty, type, cursor, page_size }),
          ),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "list_tasks",
    "List custom org tasks (cursor-paginated)",
    { ...paginationArgs },
    async ({ cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath("tasks", queryParams({ cursor, page_size })),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "create_task",
    "Create a custom org task",
    {
      title: z.string(),
      description: z.string(),
      task_type: z.string(),
      difficulty: z.string().optional(),
      points: z.number().int().optional(),
      question: z.string(),
      options: z.array(z.unknown()).optional(),
      allow_multiple: z.boolean().optional(),
      language: z.string().optional(),
      starter_code: z.string().optional(),
      expected_output: z.string().optional(),
      rubric: z.string().optional(),
      tags: z.array(z.string()).optional(),
      time_limit_minutes: z.number().int().optional(),
    },
    async (body, extra) =>
      runTool(client, () =>
        client.postWithBearer(publicPath("tasks", "create"), body, getBearerToken(extra)),
      ),
  );

  server.tool(
    "get_task",
    "Get a custom org task by id",
    { id: z.string().uuid() },
    async ({ id }, extra) =>
      runTool(client, () =>
        client.getWithBearer(publicPath("tasks", String(id)), getBearerToken(extra)),
      ),
  );

  server.tool(
    "update_task",
    "Update a custom org task",
    {
      id: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      task_type: z.string().optional(),
      difficulty: z.string().optional(),
      points: z.number().int().optional(),
      question: z.string().optional(),
      options: z.array(z.unknown()).optional(),
      allow_multiple: z.boolean().optional(),
      language: z.string().optional(),
      starter_code: z.string().optional(),
      expected_output: z.string().optional(),
      rubric: z.string().optional(),
      tags: z.array(z.string()).optional(),
      time_limit_minutes: z.number().int().optional(),
    },
    async ({ id, ...body }, extra) =>
      runTool(client, () =>
        client.patchWithBearer(publicPath("tasks", String(id)), body, getBearerToken(extra)),
      ),
  );

  server.tool(
    "delete_task",
    "Soft-delete a custom org task",
    { id: z.string().uuid() },
    async ({ id }, extra) =>
      runTool(client, () =>
        client.deleteWithBearer(publicPath("tasks", String(id)), undefined, getBearerToken(extra)),
      ),
  );

  server.tool(
    "list_webhooks",
    "List registered webhook endpoints (cursor-paginated)",
    { ...paginationArgs },
    async ({ cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath("webhooks", queryParams({ cursor, page_size })),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "create_webhook",
    "Register a webhook endpoint",
    {
      url: z.string().url(),
      events: z.array(z.string()),
      description: z.string().optional(),
    },
    async ({ url, events, description }, extra) =>
      runTool(client, () =>
        client.postWithBearer(
          publicPath("webhooks", "create"),
          { url, events, description },
          getBearerToken(extra),
        )
      ),
  );

  server.tool(
    "test_webhook",
    "Send a test ping to a webhook endpoint",
    { webhook_id: z.string().uuid() },
    async ({ webhook_id }, extra) =>
      runTool(client, () =>
        client.postWithBearer(
          publicPath("webhooks", String(webhook_id), "test"),
          undefined,
          getBearerToken(extra),
        )
      ),
  );

  server.tool(
    "get_webhook",
    "Get a webhook endpoint by id",
    { id: z.string().uuid() },
    async ({ id }, extra) =>
      runTool(client, () =>
        client.getWithBearer(publicPath("webhooks", String(id)), getBearerToken(extra)),
      ),
  );

  server.tool(
    "update_webhook",
    "Update a webhook endpoint",
    {
      id: z.string().uuid(),
      url: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      is_active: z.boolean().optional(),
    },
    async ({ id, ...body }, extra) =>
      runTool(client, () =>
        client.patchWithBearer(publicPath("webhooks", String(id)), body, getBearerToken(extra)),
      ),
  );

  server.tool(
    "delete_webhook",
    "Delete a webhook endpoint",
    { id: z.string().uuid() },
    async ({ id }, extra) =>
      runTool(client, () =>
        client.deleteWithBearer(publicPath("webhooks", String(id)), undefined, getBearerToken(extra)),
      ),
  );

  server.tool(
    "list_webhook_deliveries",
    "List delivery attempts for a webhook (cursor-paginated)",
    {
      id: z.string().uuid(),
      ...paginationArgs,
    },
    async ({ id, cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          appendQuery(
            publicPath("webhooks", String(id), "deliveries"),
            queryParams({ cursor, page_size }),
          ),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "list_interviews",
    "List live interview rooms (cursor-paginated)",
    {
      status: z.string().optional(),
      q: z.string().optional(),
      ...paginationArgs,
    },
    async ({ status, q, cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath("interviews", queryParams({ status, q, cursor, page_size })),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "create_interview",
    "Create a live interview room",
    {
      title: z.string(),
      candidate_email: z.string().email(),
      candidate_name: z.string().optional(),
      interviewer_mode: z.enum(["human_only", "ai_only", "hybrid"]).optional(),
      interview_type: z.string().optional(),
      job_description: z.string().optional(),
      resume_text: z.string().optional(),
      send_invite: z.boolean().optional(),
      scheduled_at: z.string().optional(),
    },
    async (body, extra) =>
      runTool(client, () =>
        client.postWithBearer(publicPath("interviews", "create"), body, getBearerToken(extra))
      ),
  );

  server.tool(
    "bulk_create_interviews",
    "Bulk schedule AI interviews (max 50 candidates)",
    {
      title: z.string(),
      candidates: z.array(
        z.object({
          email: z.string().email(),
          name: z.string().optional(),
          resume_text: z.string().optional(),
        }),
      ),
      interviewer_mode: z.enum(["human_only", "ai_only", "hybrid"]).optional(),
      interview_type: z.string().optional(),
      job_description: z.string().optional(),
    },
    async (body, extra) =>
      runTool(client, () =>
        client.postWithBearer(publicPath("interviews", "bulk"), body, getBearerToken(extra))
      ),
  );

  server.tool(
    "get_interview",
    "Get interview room detail",
    { room_id: z.string().uuid() },
    async ({ room_id }, extra) =>
      runTool(client, () =>
        client.getWithBearer(publicPath("interviews", String(room_id)), getBearerToken(extra))
      ),
  );

  server.tool(
    "get_interview_analysis",
    "Get post-interview analysis for a room",
    { room_id: z.string().uuid() },
    async ({ room_id }, extra) =>
      runTool(client, () =>
        client.getWithBearer(publicPath("interviews", String(room_id), "analysis"), getBearerToken(extra))
      ),
  );

  server.tool(
    "get_interview_replay",
    "Get interview recording and transcript metadata",
    { room_id: z.string().uuid() },
    async ({ room_id }, extra) =>
      runTool(client, () =>
        client.getWithBearer(publicPath("interviews", String(room_id), "replay"), getBearerToken(extra))
      ),
  );

  server.tool(
    "cancel_interview",
    "Cancel an interview room",
    { room_id: z.string().uuid() },
    async ({ room_id }, extra) =>
      runTool(client, () =>
        client.postWithBearer(publicPath("interviews", String(room_id), "cancel"), undefined, getBearerToken(extra))
      ),
  );

  server.tool(
    "reschedule_interview",
    "Reschedule an interview room",
    {
      room_id: z.string().uuid(),
      scheduled_at: z.string().describe("ISO 8601 datetime"),
    },
    async ({ room_id, scheduled_at }, extra) =>
      runTool(client, () =>
        client.postWithBearer(
          publicPath("interviews", String(room_id), "reschedule"),
          { scheduled_at },
          getBearerToken(extra),
        )
      ),
  );

  server.tool(
    "get_interview_analytics",
    "Get organisation interview KPIs",
    {},
    async (_args, extra) =>
      runTool(client, () => client.getWithBearer(publicPath("interviews", "analytics"), getBearerToken(extra))),
  );

  server.tool(
    "list_interview_templates",
    "List saved interview templates",
    {},
    async (_args, extra) =>
      runTool(client, () => client.getWithBearer(publicPath("interviews", "templates"), getBearerToken(extra))),
  );

  server.tool(
    "create_interview_template",
    "Create an interview template",
    {
      name: z.string(),
      config: z.record(z.unknown()).optional(),
    },
    async (body, extra) =>
      runTool(client, () =>
        client.postWithBearer(publicPath("interviews", "templates", "create"), body, getBearerToken(extra)),
      ),
  );

  server.tool(
    "update_interview_template",
    "Update an interview template",
    {
      template_id: z.string().uuid(),
      name: z.string().optional(),
      config: z.record(z.unknown()).optional(),
    },
    async ({ template_id, ...body }, extra) =>
      runTool(client, () =>
        client.patchWithBearer(
          publicPath("interviews", "templates", String(template_id), "update"),
          body,
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "delete_interview_template",
    "Delete an interview template",
    { template_id: z.string().uuid() },
    async ({ template_id }, extra) =>
      runTool(client, () =>
        client.deleteWithBearer(
          publicPath("interviews", "templates", String(template_id), "delete"),
          undefined,
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "share_interview",
    "Create a shareable report link for a completed interview",
    {
      room_id: z.string().uuid(),
      expires_days: z.number().int().optional(),
    },
    async ({ room_id, expires_days }, extra) =>
      runTool(client, () =>
        client.postWithBearer(
          publicPath("interviews", String(room_id), "share"),
          expires_days !== undefined ? { expires_days } : {},
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "list_interview_org_tasks",
    "List org coding tasks available for interviews",
    { q: z.string().optional() },
    async ({ q }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath("interviews/org-tasks", queryParams({ q })),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "list_pipelines",
    "List hiring pipelines (cursor-paginated)",
    { ...paginationArgs },
    async ({ cursor, page_size }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          listPath("pipelines", queryParams({ cursor, page_size })),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "get_pipeline",
    "Get a hiring pipeline by slug",
    { slug: z.string() },
    async ({ slug }, extra) =>
      runTool(client, () =>
        client.getWithBearer(publicPath("pipelines", String(slug)), getBearerToken(extra)),
      ),
  );

  server.tool(
    "get_pipeline_enrollment",
    "Get pipeline enrollment status by id",
    { id: z.string().uuid() },
    async ({ id }, extra) =>
      runTool(client, () =>
        client.getWithBearer(
          publicPath("pipelines", "enrollments", String(id)),
          getBearerToken(extra),
        ),
      ),
  );

  server.tool(
    "enroll_candidate",
    "Enroll a candidate in a pipeline",
    {
      slug: z.string(),
      email: z.string().email(),
      name: z.string().optional(),
      role: z.string().optional(),
      send_email: z.boolean().optional(),
    },
    async ({ slug, email, name, role, send_email }, extra) =>
      runTool(client, () =>
        client.postWithBearer(
          publicPath("pipelines", String(slug), "enroll"),
          {
          email,
          name,
          role,
          send_email,
          },
          getBearerToken(extra),
        )
      ),
  );

  server.tool(
    "list_integrations",
    "List ATS integration status (read-only)",
    {},
    async (_args, extra) =>
      runTool(client, () => client.getWithBearer(publicPath("integrations"), getBearerToken(extra))),
  );

  server.tool(
    "get_integration_connect_url",
    "Get dashboard URL to connect an ATS provider (browser required)",
    { provider: z.string() },
    async ({ provider }, extra) =>
      runTool(client, () => client.getWithBearer(publicPath("integrations", String(provider), "connect"), getBearerToken(extra))),
  );

  server.tool(
    "test_integration",
    "Verify stored ATS credentials for a provider (no secrets returned)",
    { provider: z.string() },
    async ({ provider }, extra) =>
      runTool(client, () =>
        client.postWithBearer(publicPath("integrations", String(provider), "test"), undefined, getBearerToken(extra))
      ),
  );
}
