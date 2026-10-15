// @query customer_residency_obligations
// Purpose : residency obligations imposed by a customer's contracts, with allowed regions.
// Path    : (Customer)-[:BOUND_BY]->(Contract)-[:HAS_CLAUSE]->(Clause)-[:IMPOSES]->(Obligation)-[:ALLOWS]->(DataRegion)
// Params  : $customer_id
// Used by : agent tool `get_customer_obligations`, `evaluate_residency`, evidence drawer
MATCH (c:Customer {id: $customer_id})-[:BOUND_BY]->(k:Contract)-[:HAS_CLAUSE]->(cl:Clause)-[:IMPOSES]->(o:Obligation)
WHERE o.type = 'DATA_RESIDENCY'
OPTIONAL MATCH (o)-[a:ALLOWS]->(r:DataRegion)
RETURN k.id AS contract_id, k.name AS contract_name, k.ref AS contract_ref,
       cl.id AS clause_id, cl.ref AS clause_ref, cl.title AS clause_title, cl.text AS clause_text,
       o.id AS obligation_id, o.name AS obligation_name,
       collect(r.code) AS allowed_regions,
       head(collect(a.quote)) AS quote, head(collect(a.src)) AS src, head(collect(a.line)) AS line
ORDER BY clause_ref

// @query all_customer_residency
// Purpose : allowed residency regions for every customer (used to classify the whole portfolio,
//           including customers with no dependency on the changed vendor).
// Params  : none
// Used by : agent tool `evaluate_residency`, impact service
MATCH (c:Customer)
OPTIONAL MATCH (c)-[:BOUND_BY]->(:Contract)-[:HAS_CLAUSE]->(cl:Clause)-[:IMPOSES]->(o:Obligation)-[:ALLOWS]->(r:DataRegion)
WHERE o.type = 'DATA_RESIDENCY'
RETURN c.id AS customer_id, c.name AS customer_name, c.segment AS segment, c.regulated AS regulated,
       c.acv_usd AS acv_usd,
       collect(DISTINCT r.code) AS allowed_regions,
       collect(DISTINCT o.id) AS obligation_ids,
       collect(DISTINCT cl.ref) AS clause_refs
ORDER BY customer_name

// @query customer_notification_obligations
// Purpose : change-notification obligations (notice period in days) for a customer.
// Params  : $customer_id
// Used by : `create_impact_case` (derives the customer-notification action + due date)
MATCH (c:Customer {id: $customer_id})-[:BOUND_BY]->(:Contract)-[:HAS_CLAUSE]->(cl:Clause)-[i:IMPOSES]->(o:Obligation)
WHERE o.type = 'CHANGE_NOTIFICATION'
RETURN o.id AS obligation_id, o.name AS obligation_name, o.notice_days AS notice_days,
       cl.ref AS clause_ref, i.quote AS quote, i.src AS src, i.line AS line
ORDER BY notice_days
