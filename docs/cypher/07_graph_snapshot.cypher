// @query snapshot_nodes
// Purpose : the live company graph for RippleSpace (3D) and the Evidence Graph (2D).
//           Large text/embedding properties are not returned.
// Params  : $labels (visible labels)
MATCH (n)
WHERE labels(n)[0] IN $labels
RETURN n.id AS id, labels(n)[0] AS label, n.name AS name,
       n.ref AS ref, n.code AS code, n.type AS type, n.status AS status, n.severity AS severity,
       n.role AS role, n.segment AS segment, n.regulated AS regulated, n.tier AS tier,
       n.src AS src, n.created_at AS created_at

// @query entity_by_id
// Purpose : one entity by stable id (label from the id prefix, whitelisted).
// Slots   : {{label}}   Params: $id
MATCH (n:{{label}} {id: $id})
RETURN n.id AS id, n.name AS name, properties(n) AS props

// @query snapshot_edges
// Purpose : relationships between visible nodes, with provenance for hover/inspection.
// Params  : $labels, $types
MATCH (a)-[r]->(b)
WHERE type(r) IN $types AND labels(a)[0] IN $labels AND labels(b)[0] IN $labels
RETURN a.id AS source, b.id AS target, type(r) AS type,
       r.src AS src, r.quote AS quote, r.loc AS loc, r.line AS line, r.change_id AS change_id
