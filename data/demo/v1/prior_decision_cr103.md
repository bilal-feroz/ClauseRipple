---
doc_id: prior_decision_cr103
title: CR-103 — GulfGov sovereign deployment boundary
kind: decision
decision_id: CR-103
date: 2026-10-06
status: Approved
customer: GulfGov
vendor: Oryx Sovereign Cloud
system: Local Inference Service
topics: [data residency, sovereignty]
made_by: Lina Farouk
approved_by: Compliance Engineering
version: 1
owner: Compliance Engineering
---

# CR-103 — GulfGov sovereign deployment boundary

## Context

GulfGov requested written confirmation that LocalSearch never uses external model providers.

## Decision

GulfGov workloads must run only on the Local Inference Service hosted by Oryx Sovereign Cloud in the UAE, with no external model provider in the request path.

## Approval

Approved by Compliance Engineering on 6 October 2026. Decision owner: Lina Farouk.
