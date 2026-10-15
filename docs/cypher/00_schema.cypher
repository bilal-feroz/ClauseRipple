// ClauseRipple — schema & indexes.
// Every query file in docs/cypher is loaded by the API at runtime (apps/api/app/graph/cypher.py):
// the documented Cypher IS the executed Cypher. {{slots}} are filled only from the ontology whitelist.

// @query index_node_id
// Range index on the stable `id` of a label. Run once per label during demo reset.
// Slots: {{label}}
CREATE INDEX FOR (n:{{label}}) ON (n.id)

// @query index_fulltext_chunk
// Full-text index over document chunks (keyword retrieval for "Ask ClauseRipple").
CREATE FULLTEXT INDEX FOR (c:Chunk) ON (c.text)

// @query index_fulltext_decision
// Full-text index over decision records (topic recall for decision memory).
CREATE FULLTEXT INDEX FOR (d:Decision) ON (d.decision, d.name)

// @query index_vector_chunk
// Vector index over chunk embeddings (384-d BAAI/bge-small-en-v1.5, cosine).
CREATE VECTOR INDEX FOR (c:Chunk) ON (c.embedding) OPTIONS {dimension: 384, similarityFunction: 'cosine'}
