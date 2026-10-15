---
doc_id: service_catalog
title: AtlasAI Service Catalog
kind: catalog
version: 1
effective_date: 2026-07-01
owner: Platform Engineering
---

# AtlasAI Service Catalog

The service catalog is the system of record for AtlasAI products, internal systems and
third-party vendors. Architecture documents describe how they connect.

## Products

| Product | Description |
|---|---|
| DocSummarizer | AI summarisation for enterprise document workflows |
| ClaimsCopilot | AI assistant for insurance claims handlers |
| LocalSearch | Sovereign enterprise search with fully local inference |

## Systems

| System | Tier | Description |
|---|---|---|
| Document Processing API | Tier 1 | Document ingestion, OCR and model inference orchestration |
| Vector Index Service | Tier 2 | Embedding storage and semantic retrieval |
| Claims Pipeline | Tier 1 | Claims intake, triage and summarisation |
| Local Inference Service | Tier 1 | Self-managed model serving for sovereign workloads |

## Vendors

| Vendor | Service | Agreement |
|---|---|---|
| ModelCloud | Hosted large language model inference API | modelcloud_dpa |
| Halcyon Vector | Managed vector database | halcyon_vector_dpa |
| Oryx Sovereign Cloud | Sovereign GPU hosting in Abu Dhabi | oryx_cloud_agreement |
