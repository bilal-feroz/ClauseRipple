---
doc_id: document_processing_architecture
title: Document Processing API — Architecture Overview
kind: architecture
version: 3
effective_date: 2026-08-20
owner: Platform Engineering
---

# Document Processing API — Architecture Overview

## Purpose

DocSummarizer is powered by the Document Processing API and the Vector Index Service.
The API accepts customer documents, extracts text, and orchestrates model inference to
produce summaries and structured extractions.

## Model inference

The Document Processing API routes model inference requests through ModelCloud.
Requests carry the customer's document text and prompts, so ModelCloud processes
Customer Data on AtlasAI's behalf. Regional endpoints are selected per tenant by the
tenant region pinning control.

## Retrieval

The Vector Index Service depends on Halcyon Vector for embedding storage and similarity
search. Embeddings are derived from Customer Data and are treated as Customer Data.

## Operations

Platform Engineering operates both services. Deployments are blue/green with automatic
rollback on elevated error rates.
