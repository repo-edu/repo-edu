---
title: Design Decisions
description: Core architectural choices in the Electron/TypeScript migration
---

## 1. Shared workflows across all delivery surfaces

Desktop, CLI, and docs use the same workflow contract and handler model to reduce behavioral drift.

## 2. Platform boundaries are explicit

Electron-specific APIs are isolated in `apps/desktop`.
Shared packages remain platform-agnostic and browser-safe where required.

## 3. Docs demo is a first-class delivery target

`apps/docs` mounts the real app with mock host adapters and has dedicated smoke/alignment tests.

## 4. No legacy migration layer

This rewrite intentionally does not include automated migration code from older course/settings formats.
