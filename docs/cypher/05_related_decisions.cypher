// @query related_decisions
// Purpose : decision memory recall. Prior decisions anchored to the same customer and/or vendor,
//           ranked by shared anchors (customer = 2, vendor = 1, topic = 1).
// Path    : (Decision)-[:APPLIES_TO]->(Customer), (Decision)-[:INVOLVES]->(Vendor)
// Params  : $customer_id, $vendor_id, $topic
// Used by : agent tool `recall_related_decisions`, Memory panel, MCP
MATCH (d:Decision)
OPTIONAL MATCH (d)-[:APPLIES_TO]->(c:Customer {id: $customer_id})
OPTIONAL MATCH (d)-[:INVOLVES]->(v:Vendor {id: $vendor_id})
WITH d, c, v
WHERE c IS NOT NULL OR v IS NOT NULL
OPTIONAL MATCH (d)-[:MADE_BY]->(owner:Person)
OPTIONAL MATCH (d)-[:APPROVED_BY]->(approver:Team)
OPTIONAL MATCH (t:Ticket)-[:IMPLEMENTS]->(d)
OPTIONAL MATCH (d)-[:CONCERNS]->(s:System)
OPTIONAL MATCH (d)-[:RESOLVES]->(ic:ImpactCase)
WITH d, c, v, owner, approver,
     collect(DISTINCT t.ref) AS tickets,
     collect(DISTINCT s.name) AS systems,
     collect(DISTINCT ic.ref) AS resolves_cases,
     (CASE WHEN c IS NULL THEN 0 ELSE 2 END) + (CASE WHEN v IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN $topic IN d.topics THEN 1 ELSE 0 END) AS score
RETURN d.id AS decision_id, d.ref AS ref, d.name AS title, d.date AS date, d.status AS status,
       d.decision AS decision, d.topics AS topics, d.src AS src, d.origin AS origin,
       c IS NOT NULL AS matches_customer, v IS NOT NULL AS matches_vendor, $topic IN d.topics AS matches_topic,
       owner.name AS owner, approver.name AS approved_by, tickets, systems, resolves_cases, score
ORDER BY score DESC, date DESC

// @query decision_memory
// Purpose : all decisions in company memory (seeded from decision records or written when a
//           human approves an agent-proposed remediation), newest first.
// Used by : GET /api/memory/decisions
MATCH (d:Decision)
OPTIONAL MATCH (d)-[:APPLIES_TO]->(c:Customer)
OPTIONAL MATCH (d)-[:INVOLVES]->(v:Vendor)
OPTIONAL MATCH (d)-[:MADE_BY]->(p:Person)
OPTIONAL MATCH (d)-[:APPROVED_BY]->(t:Team)
OPTIONAL MATCH (d)-[:RESOLVES]->(ic:ImpactCase)
RETURN d.id AS decision_id, d.ref AS ref, d.name AS title, d.date AS date, d.status AS status,
       d.decision AS decision, d.topics AS topics, d.src AS src, d.origin AS origin,
       collect(DISTINCT c.name) AS customers, collect(DISTINCT v.name) AS vendors,
       p.name AS owner, t.name AS approved_by, collect(DISTINCT ic.ref) AS resolves_cases, d.seq AS seq
ORDER BY seq DESC
