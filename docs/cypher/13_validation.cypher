// @query edge_exists
// Purpose : post-ingestion validation — does a critical relationship exist (and from which source)?
// Slots   : {{src_label}}, {{rel_type}}, {{dst_label}}   Params: $src, $dst
MATCH (a:{{src_label}} {id: $src})-[r:{{rel_type}}]->(b:{{dst_label}} {id: $dst})
RETURN count(r) AS n, head(collect(r.src)) AS src, head(collect(r.quote)) AS quote
