# AquaFleet Landing & Authentication Experience
## Design Specification

**Status:** Design specification  
**Scope:** Unauthenticated landing / login experience only  
**Project:** AquaFleet — Marine Research Fleet Management System  
**Implementation branch:** `feature/landing-redesign`

---

# 1. Purpose

This document defines the visual and UX specification for AquaFleet's new unauthenticated landing and login experience.

The redesign must transform the current authentication overlay into the visual front door of a professional marine research fleet operations platform.

This phase is intentionally limited to the unauthenticated experience.

The authenticated AquaFleet dashboard, database functionality, RBAC, APIs, CRUD operations, routes, and backend behaviour must not be redesigned or modified as part of this work.

---

# 2. Product Identity

AquaFleet is a:

> Marine Research Fleet Management Platform

It manages operational information related to research vessels, missions, expeditions, marine zones, AUV/ROV vehicles, sensors, batteries, maintenance, users, and associated marine research operations.

The interface should communicate:

- scientific credibility;
- maritime operations;
- precision;
- advanced research technology;
- calm confidence;
- professionalism;
- operational awareness.

The product must feel purpose-built for marine research.

It must NOT feel like:

- a generic Bootstrap admin template;
- a gaming interface;
- a naval warfare system;
- a cyberpunk dashboard;
- a fictional sci-fi control panel;
- a marketing landing-page template;
- a university CRUD project with decorative styling added on top.

---

# 3. Primary Visual Direction

The landing page should use a cinematic top-down marine research vessel scene.

The overall composition should combine:

- a dark deep-ocean environment;
- an unmistakable scientific research vessel;
- subtle marine telemetry;
- restrained HUD / radar elements;
- AquaFleet product identity;
- a real authentication interface.

The intended visual hierarchy is:

```text
Ocean environment
        ↓
Research vessel
        ↓
Subtle scientific HUD
        ↓
AquaFleet product identity
        ↓
Authentication interface