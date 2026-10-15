// @query evidence_dependency_paths
// Purpose : WHY is a customer exposed to a vendor? The dependency side of the evidence.
// Path    : (Customer)-[:USES]->(Product)-[:POWERED_BY]->(System)-[:DEPENDS_ON*1..4]->(Vendor)
// Params  : $customer_id, $vendor_id
// Used by : agent tool `get_source_evidence`, evidence drawer, 2D evidence graph
MATCH path = (c:Customer {id: $customer_id})-[:USES]->(:Product)-[:POWERED_BY]->(:System)-[:DEPENDS_ON*1..4]->(v:Vendor {id: $vendor_id})
RETURN [n IN nodes(path) | {id: n.id, name: n.name, label: labels(n)[0]}] AS nodes,
       [r IN relationships(path) | {type: type(r), src: r.src, src_ver: r.src_ver, quote: r.quote, loc: r.loc, line: r.line, change_id: r.change_id}] AS edges

// @query evidence_contract_paths
// Purpose : the contractual side of the evidence — which clause restricts where data may go.
// Path    : (Customer)-[:BOUND_BY]->(Contract)-[:HAS_CLAUSE]->(Clause)-[:IMPOSES]->(Obligation)-[:ALLOWS]->(DataRegion)
// Params  : $customer_id
// Used by : agent tool `get_source_evidence`, evidence drawer, 2D evidence graph
MATCH path = (c:Customer {id: $customer_id})-[:BOUND_BY]->(:Contract)-[:HAS_CLAUSE]->(:Clause)-[:IMPOSES]->(o:Obligation)-[:ALLOWS]->(:DataRegion)
WHERE o.type = 'DATA_RESIDENCY'
RETURN [n IN nodes(path) | {id: n.id, name: n.name, label: labels(n)[0]}] AS nodes,
       [r IN relationships(path) | {type: type(r), src: r.src, src_ver: r.src_ver, quote: r.quote, loc: r.loc, line: r.line}] AS edges

// @query document_by_id
// Purpose : source document text + metadata for the evidence viewer.
// Params  : $doc_id
MATCH (d:Document {doc_id: $doc_id})
RETURN d.id AS id, d.doc_id AS doc_id, d.name AS title, d.kind AS kind, d.version AS version,
       d.effective_date AS effective_date, d.path AS path, d.sha256 AS sha256, d.text AS text, d.owner AS owner

// @query documents_list
// Purpose : document inventory (top bar count, sources tab).
MATCH (d:Document)
RETURN d.id AS id, d.doc_id AS doc_id, d.name AS title, d.kind AS kind, d.version AS version,
       d.effective_date AS effective_date, d.path AS path, d.owner AS owner
ORDER BY kind, doc_id

// @query node_detail
// Purpose : one node with its direct neighbourhood (node inspector).
// Params  : $id
MATCH (n {id: $id})
OPTIONAL MATCH (n)-[r]-(m)
WHERE NOT labels(m)[0] IN ['Chunk', 'ToolCall']
RETURN properties(n) AS props, labels(n)[0] AS label,
       collect({rel: type(r), outgoing: startNode(r) = n, id: m.id, name: m.name, label: labels(m)[0], quote: r.quote, src: r.src}) AS neighbours
