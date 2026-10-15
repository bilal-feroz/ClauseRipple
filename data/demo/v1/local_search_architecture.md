---
doc_id: local_search_architecture
title: LocalSearch — Architecture Overview
kind: architecture
version: 1
effective_date: 2026-05-02
owner: Edge Infrastructure
---

# LocalSearch — Architecture Overview

## Purpose

LocalSearch is powered by the Local Inference Service. It is designed for sovereign
customers whose data must never leave the United Arab Emirates.

## Inference

The Local Inference Service depends on Oryx Sovereign Cloud for GPU hosting in Abu Dhabi.
The Local Inference Service does not call ModelCloud or any other external model provider;
all models are served from AtlasAI-managed weights.

## Isolation

Each sovereign tenant receives dedicated GPU nodes and encrypted volumes. Operational
access requires just-in-time approval from Edge Infrastructure.
