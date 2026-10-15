# AtlasAI demo world (synthetic)

**Everything in this folder is fictional.** AtlasAI and every organisation, person,
product, contract, ticket and decision named here are invented for the ClauseRipple
demo. Any resemblance to real companies (including any real company that happens to
share a name such as "ModelCloud", "Falcon Bank" or "Nova Retail") is coincidental;
nothing here describes the real terms, products or behaviour of any real entity.

## Layout

```
v1/   baseline company corpus (ingested by POST /api/demo/reset)
v2/   changed documents (ModelCloud DPA version 2), applied by POST /api/demo/apply-change
```

Each file is Markdown with YAML front matter (document-management metadata). Facts are
extracted from the **body text** so every graph relationship carries an exact source quote.

| Kind | Files | Facts extracted |
|---|---|---|
| reference | `regions.md` | DataRegion |
| catalog | `service_catalog.md` | Product, System, Vendor |
| crm | `customer_register.md` | Customer, ACCOUNT_MANAGER_FOR |
| directory | `engineering_directory.md` | Team, Person, MEMBER_OF, LEADS |
| ownership | `team_ownership.md` | System OWNED_BY Team |
| controls | `security_controls.md` | Control, OWNED_BY, IMPLEMENTED_IN, SATISFIED_BY |
| architecture | `*_architecture.md` | Product POWERED_BY System, System DEPENDS_ON Vendor |
| contract | `*_msa.md` | Contract, Clause, Obligation, USES, BOUND_BY, HAS_CLAUSE, IMPOSES, ALLOWS |
| dpa | `*_dpa.md`, `oryx_cloud_agreement.md` | Vendor PROCESSES_IN DataRegion |
| decision | `prior_decision_*.md` | Decision + APPLIES_TO / INVOLVES / CONCERNS / MADE_BY / APPROVED_BY |
| ticket | `platform_ticket_*.md` | Ticket + IMPLEMENTS / CONCERNS / ASSIGNED_TO |
