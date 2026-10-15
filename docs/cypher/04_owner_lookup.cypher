// @query system_owner
// Purpose : who owns a system? Graph ownership drives case assignment (no hardcoded owners).
// Path    : (System)-[:OWNED_BY]->(Team)<-[:LEADS]-(Person)
// Params  : $system_id
// Used by : agent tool `find_owner`, `assign_impact_case` guardrail
MATCH (s:System {id: $system_id})-[o:OWNED_BY]->(t:Team)
OPTIONAL MATCH (lead:Person)-[l:LEADS]->(t)
OPTIONAL MATCH (m:Person)-[:MEMBER_OF]->(t)
RETURN s.id AS system_id, s.name AS system_name,
       t.id AS team_id, t.name AS team_name,
       lead.id AS lead_id, lead.name AS lead_name, lead.role AS lead_role,
       collect(DISTINCT m.name) AS members,
       o.quote AS ownership_quote, o.src AS ownership_src, o.line AS ownership_line,
       l.quote AS lead_quote, l.src AS lead_src, l.line AS lead_line

// @query obligation_control_owners
// Purpose : which controls satisfy an obligation and who owns them (routes the compliance review).
// Path    : (Obligation)-[:SATISFIED_BY]->(Control)-[:OWNED_BY]->(Team)<-[:LEADS]-(Person)
// Params  : $obligation_id
// Used by : `create_impact_case` (review action owner)
MATCH (o:Obligation {id: $obligation_id})-[:SATISFIED_BY]->(ctl:Control)-[ob:OWNED_BY]->(t:Team)
OPTIONAL MATCH (lead:Person)-[:LEADS]->(t)
OPTIONAL MATCH (ctl)-[:IMPLEMENTED_IN]->(s:System)
RETURN ctl.id AS control_id, ctl.ref AS control_ref, ctl.name AS control_name,
       t.id AS team_id, t.name AS team_name, lead.id AS lead_id, lead.name AS lead_name,
       s.id AS implemented_in_id, s.name AS implemented_in,
       ob.quote AS quote, ob.src AS src, ob.line AS line
ORDER BY control_ref

// @query account_manager
// Purpose : the account manager responsible for customer communication.
// Params  : $customer_id
// Used by : `create_impact_case` (customer-notification action owner)
MATCH (p:Person)-[r:ACCOUNT_MANAGER_FOR]->(c:Customer {id: $customer_id})
RETURN p.id AS person_id, p.name AS person_name, p.role AS role, r.quote AS quote, r.src AS src, r.line AS line

// @query person_team_membership
// Purpose : guardrail check — is this person a lead or member of this team?
// Params  : $person_id, $team_id
// Used by : `assign_impact_case`
MATCH (p:Person {id: $person_id}), (t:Team {id: $team_id})
RETURN p.name AS person_name, t.name AS team_name,
       (p)-[:LEADS]->(t) AS leads, (p)-[:MEMBER_OF]->(t) AS member
