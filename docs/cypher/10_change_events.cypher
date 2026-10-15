// @query next_sequence
// Purpose : next sequence number for a label (ChangeEvent / AgentRun) — derived from the graph.
// Slots   : {{label}}
MATCH (n:{{label}})
RETURN coalesce(max(n.seq), 0) + 1 AS next

// @query create_change_event
// Purpose : persist a detected source change as a first-class graph event.
// Params  : $props, $doc_node
MATCH (d:Document {id: $doc_node})
CREATE (ce:ChangeEvent)
SET ce = $props
MERGE (ce)-[:CHANGED]->(d)
RETURN ce.id AS id

// @query link_change_subject
// Purpose : (ChangeEvent)-[:CHANGED]->(entity whose facts changed), e.g. the Vendor.
// Slots   : {{label}}   Params: $change_id, $subject_id
MATCH (ce:ChangeEvent {id: $change_id}), (s:{{label}} {id: $subject_id})
MERGE (ce)-[:CHANGED]->(s)

// @query link_change_introduced
// Purpose : (ChangeEvent)-[:INTRODUCED {rel, subject}]->(object of an added fact), e.g. DataRegion US.
// Slots   : {{label}}   Params: $change_id, $object_id, $rel, $subject_id, $quote
MATCH (ce:ChangeEvent {id: $change_id}), (o:{{label}} {id: $object_id})
MERGE (ce)-[r:INTRODUCED {rel: $rel, subject: $subject_id}]->(o)
SET r.quote = $quote

// @query link_change_retracted
// Purpose : (ChangeEvent)-[:RETRACTED {rel, subject}]->(object of a removed fact).
// Slots   : {{label}}   Params: $change_id, $object_id, $rel, $subject_id, $quote
MATCH (ce:ChangeEvent {id: $change_id}), (o:{{label}} {id: $object_id})
MERGE (ce)-[r:RETRACTED {rel: $rel, subject: $subject_id}]->(o)
SET r.quote = $quote

// @query change_event_detail
// Purpose : a change event with what it touched (agent tool `inspect_change`).
// Params  : $change_id
MATCH (ce:ChangeEvent {id: $change_id})
OPTIONAL MATCH (ce)-[:CHANGED]->(subject)
WHERE NOT subject:Document
OPTIONAL MATCH (ce)-[:CHANGED]->(doc:Document)
OPTIONAL MATCH (ce)-[i:INTRODUCED]->(added)
OPTIONAL MATCH (ce)-[x:RETRACTED]->(removed)
RETURN properties(ce) AS change,
       collect(DISTINCT {id: subject.id, name: subject.name, label: labels(subject)[0]}) AS subjects,
       collect(DISTINCT {id: doc.id, doc_id: doc.doc_id, title: doc.name, version: doc.version}) AS documents,
       collect(DISTINCT {rel: i.rel, subject: i.subject, object_id: added.id, object_name: added.name, object_code: added.code, quote: i.quote}) AS introduced,
       collect(DISTINCT {rel: x.rel, subject: x.subject, object_id: removed.id, object_name: removed.name, quote: x.quote}) AS retracted

// @query change_events_list
// Purpose : change-event history (newest first).
MATCH (ce:ChangeEvent)
OPTIONAL MATCH (run:AgentRun)-[:TRIGGERED_BY]->(ce)
RETURN properties(ce) AS change, collect(run.id) AS runs, ce.seq AS seq
ORDER BY seq DESC
