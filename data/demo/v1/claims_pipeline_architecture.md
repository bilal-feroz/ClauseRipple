---
doc_id: claims_pipeline_architecture
title: Claims Pipeline — Architecture Overview
kind: architecture
version: 2
effective_date: 2026-06-11
owner: Claims Engineering
---

# Claims Pipeline — Architecture Overview

## Purpose

ClaimsCopilot is powered by the Claims Pipeline. The pipeline ingests first notice of
loss reports, classifies claims, and drafts adjuster summaries.

## Model inference

The Claims Pipeline sends claim summaries and adjuster prompts to ModelCloud for inference.
Claim files contain personal and health information and are classified as Customer Data.

## Storage

Claim artefacts are stored in AtlasAI-managed object storage in the customer's contracted
region. The pipeline keeps no copy of model outputs after the claim is closed.
