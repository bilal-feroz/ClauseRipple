// @query entity_catalog
// Purpose : names, refs and codes of linkable entities (entity linking for "Ask ClauseRipple").
// Params  : $labels
MATCH (n)
WHERE labels(n)[0] IN $labels
RETURN n.id AS id, labels(n)[0] AS label, n.name AS name, n.ref AS ref, n.code AS code

// @query customers_allowing_region
// Purpose : which customers' residency obligations allow a region (e.g. "who permits US processing?").
// Path    : (Customer)-[:BOUND_BY]->(Contract)-[:HAS_CLAUSE]->(Clause)-[:IMPOSES]->(Obligation)-[:ALLOWS]->(DataRegion)
// Params  : $code
MATCH (c:Customer)-[:BOUND_BY]->(:Contract)-[:HAS_CLAUSE]->(cl:Clause)-[:IMPOSES]->(o:Obligation)-[a:ALLOWS]->(r:DataRegion {code: $code})
WHERE o.type = 'DATA_RESIDENCY'
RETURN c.id AS customer_id, c.name AS customer_name, cl.ref AS clause_ref, cl.title AS clause_title,
       a.quote AS quote, a.src AS src, a.line AS line
ORDER BY customer_name

// @query cases_for_customer
// Purpose : impact cases affecting a customer (second-session memory: "what did we decide about X?").
// Params  : $customer_id
MATCH (ic:ImpactCase)-[:AFFECTS]->(c:Customer {id: $customer_id})
OPTIONAL MATCH (ic)-[:ASSIGNED_TO]->(p:Person)
OPTIONAL MATCH (ic)-[:CAUSED_BY]->(v:Vendor)
OPTIONAL MATCH (d:Decision)-[:RESOLVES]->(ic)
RETURN ic.id AS case_id, ic.ref AS ref, ic.status AS status, ic.severity AS severity,
       ic.recommended_action AS recommended_action, ic.created_at AS created_at,
       p.name AS assignee, v.name AS vendor, collect(d.ref) AS resolved_by, ic.seq AS seq
ORDER BY seq

// @query search_chunks_fulltext
// Purpose : keyword retrieval over document chunks (FalkorDB full-text index, RediSearch syntax).
// Params  : $q
CALL db.idx.fulltext.queryNodes('Chunk', $q) YIELD node, score
RETURN node.id AS chunk_id, node.doc_id AS doc_id, node.section AS section, node.text AS text,
       node.line AS line, score
ORDER BY score DESC
LIMIT 6

// @query search_chunks_vector
// Purpose : semantic retrieval over document chunks (FalkorDB vector index; score is a distance,
//           lower = more similar).
// Params  : $k, $vec
CALL db.idx.vector.queryNodes('Chunk', 'embedding', $k, vecf32($vec)) YIELD node, score
RETURN node.id AS chunk_id, node.doc_id AS doc_id, node.section AS section, node.text AS text,
       node.line AS line, score
ORDER BY score

// @query dependency_chokepoints
// Purpose : graph algorithm: dependency chokepoints — betweenness centrality over the
//           dependency subgraph (customers -> products -> systems -> vendors).
CALL algo.betweenness({nodeLabels: ['Customer', 'Product', 'System', 'Vendor'], relationshipTypes: ['USES', 'POWERED_BY', 'DEPENDS_ON']})
YIELD node, score
RETURN node.id AS id, node.name AS name, labels(node)[0] AS label, score
ORDER BY score DESC
LIMIT 8
