// Ingestion writes. Labels / relationship types are template slots filled from the ontology
// whitelist (Cypher cannot parameterise them); all values are parameters.

// @query upsert_nodes
// Purpose : idempotent node upsert (MERGE on stable id) for one label.
// Slots   : {{label}}   Params: $rows = [{id, props}]
UNWIND $rows AS row
MERGE (n:{{label}} {id: row.id})
SET n += row.props

// @query upsert_edges
// Purpose : idempotent relationship upsert with provenance properties (src, src_ver, quote, loc, line).
// Slots   : {{src_label}}, {{rel_type}}, {{dst_label}}   Params: $rows = [{src, dst, props}]
UNWIND $rows AS row
MATCH (a:{{src_label}} {id: row.src}), (b:{{dst_label}} {id: row.dst})
MERGE (a)-[r:{{rel_type}}]->(b)
SET r += row.props

// @query delete_edge
// Purpose : remove one relationship that a new document version no longer supports.
// Slots   : {{src_label}}, {{rel_type}}, {{dst_label}}   Params: $src, $dst, $doc
MATCH (a:{{src_label}} {id: $src})-[r:{{rel_type}}]->(b:{{dst_label}} {id: $dst})
WHERE r.src = $doc
DELETE r

// @query edges_from_document
// Purpose : every relationship whose provenance is a given document (the incremental-update diff base).
// Params  : $doc
MATCH (a)-[r]->(b)
WHERE r.src = $doc
RETURN a.id AS src, type(r) AS type, b.id AS dst, r.src_ver AS src_ver, r.quote AS quote

// @query delete_document_chunks
// Purpose : drop a document's chunks before re-chunking a new version.
// Params  : $doc_node
MATCH (c:Chunk)-[:PART_OF]->(d:Document {id: $doc_node})
DELETE c

// @query link_chunks
// Purpose : attach chunks to their document.
// Params  : $rows = [{chunk, doc}]
UNWIND $rows AS row
MATCH (c:Chunk {id: row.chunk}), (d:Document {id: row.doc})
MERGE (c)-[:PART_OF]->(d)

// @query set_chunk_embeddings
// Purpose : store 384-d embeddings as FalkorDB vectors.
// Params  : $rows = [{id, embedding}]
UNWIND $rows AS row
MATCH (c:Chunk {id: row.id})
SET c.embedding = vecf32(row.embedding)
