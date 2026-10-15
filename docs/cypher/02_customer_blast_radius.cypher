// @query customer_blast_radius
// Purpose : the multi-hop core of ClauseRipple. Which customers reach a vendor through
//           the products they use and the systems powering those products?
// Path    : (Customer)-[:USES]->(Product)-[:POWERED_BY]->(System)-[:DEPENDS_ON*1..4]->(Vendor)
// Params  : $vendor_id
// Used by : agent tool `find_impacted_customers`, impact service, RippleSpace ripple ordering
// Notes   : `hops` is the path length; RippleSpace sequences its shockwave by this depth.
MATCH (v:Vendor {id: $vendor_id})
MATCH path = (c:Customer)-[:USES]->(p:Product)-[:POWERED_BY]->(s:System)-[:DEPENDS_ON*1..4]->(v)
RETURN c.id AS customer_id,
       c.name AS customer_name,
       p.id AS product_id,
       p.name AS product_name,
       s.id AS system_id,
       s.name AS system_name,
       length(path) AS hops,
       [n IN nodes(path) | {id: n.id, name: n.name, label: labels(n)[0]}] AS path_nodes,
       [r IN relationships(path) | {type: type(r), src: r.src, src_ver: r.src_ver, quote: r.quote, loc: r.loc, line: r.line}] AS path_edges
ORDER BY customer_name, product_name, system_name

// @query dependency_path_exists
// Purpose : bounded proof of absence. Is there ANY dependency path from a customer to a vendor
//           (USES / POWERED_BY / DEPENDS_ON, up to 6 hops)? A null path means "no dependency".
// Params  : $customer_id, $vendor_id
// Used by : agent tool `evaluate_residency` (explains GulfGov = not impacted), evidence drawer
MATCH (c:Customer {id: $customer_id}), (v:Vendor {id: $vendor_id})
WITH c, v
RETURN shortestPath((c)-[:USES|POWERED_BY|DEPENDS_ON*1..6]->(v)) AS path
