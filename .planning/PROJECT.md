# swayam404 — SWAYAM Assignment Assistant (Chrome Extension)

## Project Overview
**swayam404** is a high-grade Chrome Extension (Manifest V3) built with React, TypeScript, and Vite designed to help students manage repetitive assignment work on the SWAYAM learning portal.

### Core Objectives
1. **Multi-Course Management**: Support multiple courses (e.g. Economics as common course, Entrepreneurship as minor, plus custom minor courses) with strict course isolation.
2. **Answer Bank Persistence**: Local, schema-validated answer bank storage using Chrome Extension Storage (with dev fallback).
3. **Smart Question Recognition & Matching Engine**:
   - Level 1: Exact normalized match.
   - Level 2: Conservative deterministic text similarity.
   - Level 3: Ambiguity detection (flags altered numbers, negations, critical terms, option mismatches).
4. **Transparent Match Review UI**: Dark charcoal developer-grade interface showing confidence categories, options comparison, diffs/explanations, and explicit student approval checkboxes.
5. **Approved Form Population (Safe DOM Interaction)**:
   - Populates only student-approved fields.
   - Dispatches proper DOM input/change events for controlled components.
   - **Never auto-submits** assignments or confirms final submission dialogs.
6. **Privacy & Security First**: Zero credential harvesting, zero external data leakage, local-only by default.
7. **Comprehensive Testing**: Automated Vitest suite for matching, normalization, course isolation, import/export, and DOM adapter fixtures.

## Technical Stack
- **Framework**: React 18 / 19 + TypeScript
- **Bundler & Build Tool**: Vite + `@crxjs/vite-plugin` (or Vite multi-entry rollup config for extension build: popup, sidepanel, content script, background service worker)
- **Manifest**: Chrome Extension Manifest V3
- **Test Runner**: Vitest with jsdom
- **Styling**: Modern sleek dark theme (CSS variables, developer productivity aesthetic)
