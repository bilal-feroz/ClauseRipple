// @query stats_labels
// Purpose : real node counts per label (top bar metrics — never hardcoded).
MATCH (n)
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY label

// @query stats_relationships
// Purpose : real relationship count.
MATCH ()-[r]->()
RETURN count(r) AS count

// @query demo_state
// Purpose : derive BASELINE / UPDATED from the graph itself (ModelCloud DPA version + change events).
MATCH (d:Document {doc_id: 'modelcloud_dpa'})
OPTIONAL MATCH (ce:ChangeEvent)
WITH d, ce ORDER BY ce.seq DESC
RETURN d.version AS dpa_version, collect(ce.id)[0] AS latest_change_id, count(ce) AS change_events
