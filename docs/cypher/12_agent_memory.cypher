// @query create_agent_run
// Purpose : persist an agent run (operational memory; no chain-of-thought is stored).
// Params  : $props, $change_id
CREATE (run:AgentRun)
SET run = $props
WITH run
OPTIONAL MATCH (ce:ChangeEvent {id: $change_id})
FOREACH (_ IN CASE WHEN ce IS NULL THEN [] ELSE [1] END | MERGE (run)-[:TRIGGERED_BY]->(ce))
RETURN run.id AS id

// @query record_tool_call
// Purpose : one structured tool step (tool, input, result summary, metrics) linked to its run.
// Params  : $run_id, $seq, $props
MATCH (run:AgentRun {id: $run_id})
CREATE (tc:ToolCall)
SET tc = $props
MERGE (run)-[:EXECUTED {seq: $seq}]->(tc)
RETURN tc.id AS id

// @query link_tool_touched
// Purpose : (ToolCall)-[:TOUCHED]->(entity) for the graph entities a tool step read or wrote.
// Params  : $toolcall_id, $ids
MATCH (tc:ToolCall {id: $toolcall_id}), (n)
WHERE n.id IN $ids
MERGE (tc)-[:TOUCHED]->(n)

// @query link_run_created
// Purpose : (AgentRun)-[:CREATED]->(ImpactCase).
// Params  : $run_id, $case_id
MATCH (run:AgentRun {id: $run_id}), (ic:ImpactCase {id: $case_id})
MERGE (run)-[:CREATED]->(ic)

// @query link_run_referenced
// Purpose : (AgentRun)-[:REFERENCED]->(Decision) — which memories the run used.
// Params  : $run_id, $decision_id
MATCH (run:AgentRun {id: $run_id}), (d:Decision {id: $decision_id})
MERGE (run)-[:REFERENCED]->(d)

// @query complete_agent_run
// Purpose : final metrics + summary for a run.
// Params  : $run_id, $props
MATCH (run:AgentRun {id: $run_id})
SET run += $props
RETURN run.id AS id

// @query agent_run_detail
// Purpose : replay a run from FalkorDB (second session / SSE replay after restart).
// Params  : $run_id
MATCH (run:AgentRun {id: $run_id})
OPTIONAL MATCH (run)-[:EXECUTED]->(tc:ToolCall)
WITH run, tc ORDER BY tc.seq
RETURN properties(run) AS run, collect(properties(tc)) AS tool_calls

// @query agent_runs_list
// Purpose : agent run history with what each run created and referenced.
MATCH (run:AgentRun)
OPTIONAL MATCH (run)-[:CREATED]->(ic:ImpactCase)
OPTIONAL MATCH (run)-[:REFERENCED]->(d:Decision)
OPTIONAL MATCH (run)-[:TRIGGERED_BY]->(ce:ChangeEvent)
RETURN properties(run) AS run, collect(DISTINCT ic.ref) AS created_cases,
       collect(DISTINCT d.ref) AS referenced_decisions, ce.ref AS change_ref
ORDER BY run.seq DESC

// @query runs_touching_entity
// Purpose : "which agent runs touched Falcon Bank?" — graph-native agent observability.
// Params  : $id
MATCH (run:AgentRun)-[:EXECUTED]->(tc:ToolCall)-[:TOUCHED]->(n {id: $id})
RETURN run.id AS run_id, run.ref AS run_ref, collect(DISTINCT tc.tool) AS tools, run.started_at AS started_at
ORDER BY started_at DESC
