// @query next_change_record_seq
// Purpose : next CR-### number. Decisions and impact cases share the change-record sequence,
//           so the next number is derived from company memory (CR-103 -> CR-104).
MATCH (n)
WHERE n:Decision OR n:ImpactCase
RETURN coalesce(max(n.seq), 0) + 1 AS next

// @query create_impact_case
// Purpose : the agent's action — persist an ImpactCase and link it to everything that justifies it.
// Params  : $props, $customer_id, $vendor_id, $product_id, $system_id, $obligation_id, $change_id
MATCH (c:Customer {id: $customer_id}), (v:Vendor {id: $vendor_id}), (p:Product {id: $product_id}),
      (s:System {id: $system_id}), (o:Obligation {id: $obligation_id})
CREATE (ic:ImpactCase)
SET ic = $props
MERGE (ic)-[:AFFECTS]->(c)
MERGE (ic)-[:CAUSED_BY]->(v)
MERGE (ic)-[:INVOLVES]->(p)
MERGE (ic)-[:INVOLVES]->(s)
MERGE (ic)-[:VIOLATES]->(o)
WITH ic
OPTIONAL MATCH (ce:ChangeEvent {id: $change_id})
FOREACH (_ IN CASE WHEN ce IS NULL THEN [] ELSE [1] END | MERGE (ic)-[:ORIGINATED_FROM]->(ce))
RETURN ic.id AS id, ic.ref AS ref

// @query link_case_decision
// Purpose : (ImpactCase)-[:RELATED_TO]->(Decision) — prior memory used as evidence.
// Params  : $case_id, $decision_id
MATCH (ic:ImpactCase {id: $case_id}), (d:Decision {id: $decision_id})
MERGE (ic)-[:RELATED_TO]->(d)

// @query link_case_documents
// Purpose : (ImpactCase)-[:SUPPORTED_BY]->(Document) for every source document in the evidence.
// Params  : $case_id, $doc_ids
MATCH (ic:ImpactCase {id: $case_id}), (d:Document)
WHERE d.doc_id IN $doc_ids
MERGE (ic)-[:SUPPORTED_BY]->(d)

// @query create_case_action
// Purpose : a remediation action owned by a graph-resolved person.
// Params  : $case_id, $props, $owner_id
MATCH (ic:ImpactCase {id: $case_id}), (p:Person {id: $owner_id})
CREATE (a:Action)
SET a = $props
MERGE (ic)-[:HAS_ACTION]->(a)
MERGE (a)-[:OWNED_BY]->(p)
RETURN a.id AS id

// @query assign_case
// Purpose : the agent's assignment — (ImpactCase)-[:ASSIGNED_TO]->(Person) and ->(Team).
// Params  : $case_id, $person_id, $team_id, $assigned_at, $reason
MATCH (ic:ImpactCase {id: $case_id}), (p:Person {id: $person_id}), (t:Team {id: $team_id})
MERGE (ic)-[ap:ASSIGNED_TO]->(p)
SET ap.assigned_at = $assigned_at, ap.reason = $reason
MERGE (ic)-[at:ASSIGNED_TO]->(t)
SET at.assigned_at = $assigned_at, ic.status = 'NEEDS_REVIEW', ic.assignee = p.name, ic.team = t.name
RETURN ic.id AS id, p.name AS person, t.name AS team

// @query open_case_for
// Purpose : idempotency — an open case already covering this customer + vendor + change?
// Params  : $customer_id, $vendor_id, $change_id
MATCH (ic:ImpactCase)-[:AFFECTS]->(:Customer {id: $customer_id}), (ic)-[:CAUSED_BY]->(:Vendor {id: $vendor_id})
WHERE ic.change_id = $change_id
RETURN ic.id AS id, ic.ref AS ref

// @query cases_list
// Purpose : impact cases with their assignment, newest first.
MATCH (ic:ImpactCase)
OPTIONAL MATCH (ic)-[:AFFECTS]->(c:Customer)
OPTIONAL MATCH (ic)-[:CAUSED_BY]->(v:Vendor)
OPTIONAL MATCH (ic)-[:ASSIGNED_TO]->(p:Person)
OPTIONAL MATCH (ic)-[:ASSIGNED_TO]->(t:Team)
RETURN properties(ic) AS case, c.id AS customer_id, c.name AS customer, v.name AS vendor,
       p.name AS assignee, t.name AS team
ORDER BY ic.seq DESC

// @query case_detail
// Purpose : one impact case with everything it links to (case view, second-session memory).
// Params  : $case_id
MATCH (ic:ImpactCase {id: $case_id})
OPTIONAL MATCH (ic)-[:AFFECTS]->(c:Customer)
OPTIONAL MATCH (ic)-[:CAUSED_BY]->(v:Vendor)
OPTIONAL MATCH (ic)-[:INVOLVES]->(inv)
OPTIONAL MATCH (ic)-[:VIOLATES]->(o:Obligation)
OPTIONAL MATCH (ic)-[:ASSIGNED_TO]->(p:Person)
OPTIONAL MATCH (ic)-[:ASSIGNED_TO]->(t:Team)
OPTIONAL MATCH (ic)-[:RELATED_TO]->(d:Decision)
OPTIONAL MATCH (ic)-[:SUPPORTED_BY]->(doc:Document)
OPTIONAL MATCH (ic)-[:HAS_ACTION]->(a:Action)-[:OWNED_BY]->(ao:Person)
OPTIONAL MATCH (run:AgentRun)-[:CREATED]->(ic)
OPTIONAL MATCH (res:Decision)-[:RESOLVES]->(ic)
RETURN properties(ic) AS case,
       c.id AS customer_id, c.name AS customer, v.id AS vendor_id, v.name AS vendor,
       collect(DISTINCT {id: inv.id, name: inv.name, label: labels(inv)[0]}) AS involves,
       o.id AS obligation_id, o.name AS obligation,
       p.id AS assignee_id, p.name AS assignee, t.id AS team_id, t.name AS team,
       collect(DISTINCT {id: d.id, ref: d.ref, title: d.name, decision: d.decision, date: d.date}) AS related_decisions,
       collect(DISTINCT {doc_id: doc.doc_id, title: doc.name, version: doc.version}) AS documents,
       collect(DISTINCT {id: a.id, title: a.title, kind: a.kind, status: a.status, requires_approval: a.requires_approval, due_date: a.due_date, owner: ao.name, basis: a.basis}) AS actions,
       run.id AS created_by_run, collect(DISTINCT res.ref) AS resolved_by

// @query update_case_status
// Purpose : human-in-the-loop status transition (review / approve / resolve).
// Params  : $case_id, $status, $at, $note
MATCH (ic:ImpactCase {id: $case_id})
SET ic.status = $status, ic.updated_at = $at, ic.last_note = $note
RETURN ic.id AS id, ic.status AS status

// @query approve_case_actions
// Purpose : approving remediation approves every action that required human approval.
// Params  : $case_id, $at
MATCH (ic:ImpactCase {id: $case_id})-[:HAS_ACTION]->(a:Action)
WHERE a.requires_approval = true
SET a.status = 'APPROVED', a.approved_at = $at
RETURN count(a) AS approved

// @query record_resolution_decision
// Purpose : close the memory loop — an approved remediation becomes a new Decision node that
//           future agent runs recall (APPLIES_TO customer, INVOLVES vendor, RESOLVES case).
// Params  : $props, $case_id, $customer_id, $vendor_id, $person_id, $team_id
MATCH (ic:ImpactCase {id: $case_id}), (c:Customer {id: $customer_id}), (v:Vendor {id: $vendor_id}),
      (p:Person {id: $person_id}), (t:Team {id: $team_id})
CREATE (d:Decision)
SET d = $props
MERGE (d)-[:RESOLVES]->(ic)
MERGE (d)-[:APPLIES_TO]->(c)
MERGE (d)-[:INVOLVES]->(v)
MERGE (d)-[:MADE_BY]->(p)
MERGE (d)-[:APPROVED_BY]->(t)
RETURN d.id AS id, d.ref AS ref
