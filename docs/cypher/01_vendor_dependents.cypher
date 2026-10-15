// @query vendor_dependents
// Purpose : every System that depends on a Vendor, directly or through other systems.
// Params  : $vendor_id
// Used by : agent tool `trace_vendor_dependents`, impact service, MCP
// Notes   : variable-length DEPENDS_ON*1..4 so transitive system->system dependencies count.
//           Each returned relationship carries its source document + exact quote.
MATCH (v:Vendor {id: $vendor_id})
MATCH path = (s:System)-[:DEPENDS_ON*1..4]->(v)
RETURN s.id AS system_id,
       s.name AS system_name,
       s.tier AS tier,
       length(path) AS hops,
       [n IN nodes(path) | n.id] AS path_ids,
       [r IN relationships(path) | {type: type(r), src: r.src, src_ver: r.src_ver, quote: r.quote, loc: r.loc, line: r.line}] AS evidence
ORDER BY hops, system_name

// @query vendor_regions
// Purpose : regions where a vendor may process covered customer data (from its DPA), with provenance.
// Params  : $vendor_id
// Used by : agent tools `inspect_change` / `evaluate_residency`, evidence drawer
MATCH (v:Vendor {id: $vendor_id})-[r:PROCESSES_IN]->(d:DataRegion)
RETURN d.id AS region_id, d.code AS code, d.name AS name,
       r.src AS src, r.src_ver AS src_ver, r.quote AS quote, r.loc AS loc, r.line AS line,
       r.change_id AS change_id
ORDER BY code
