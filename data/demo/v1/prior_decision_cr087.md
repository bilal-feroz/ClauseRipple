---
doc_id: prior_decision_cr087
title: CR-087 — ModelCloud regional processing exception (Falcon Bank)
kind: decision
decision_id: CR-087
date: 2026-09-28
status: Approved
customer: Falcon Bank
vendor: ModelCloud
system: Document Processing API
topics: [data residency, vendor processing location]
made_by: Sarah Malik
approved_by: Compliance Engineering
version: 1
owner: Compliance Engineering
---

# CR-087 — ModelCloud regional processing exception (Falcon Bank)

## Context

ModelCloud announced a capacity failover programme that could temporarily route inference
outside its contracted regions. Falcon Bank's agreement restricts processing to the UAE and
the EU, so the change was escalated to Compliance Engineering.

## Decision

Falcon Bank workloads must remain pinned to UAE/EU processing whenever ModelCloud's regional scope changes. Platform Engineering enforces this with tenant region pinning in the Document Processing API.

## Approval

Approved by Compliance Engineering on 28 September 2026. Decision owner: Sarah Malik.
Implementation tracked in PLAT-481.
