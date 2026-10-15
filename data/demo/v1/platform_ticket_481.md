---
doc_id: platform_ticket_481
title: PLAT-481 — Enforce tenant region pinning for Falcon Bank
kind: ticket
ticket_id: PLAT-481
status: Done
assignee: Priya Raman
implements: CR-087
system: Document Processing API
version: 1
owner: Platform Engineering
---

# PLAT-481 — Enforce tenant region pinning for Falcon Bank

**Type:** Change · **Priority:** High · **Status:** Done

## Description

Implement CR-087. Requests from the Falcon Bank tenant must only reach ModelCloud's UAE
and EU inference endpoints, even during ModelCloud capacity failover events.

## Resolution

Tenant region pinning is enabled for the Falcon Bank tenant in the Document Processing API. Verified on 2 October 2026 by Priya Raman.
