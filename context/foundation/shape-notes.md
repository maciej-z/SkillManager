---
project: "SkillManager"
context_type: greenfield
created: 2026-09-08
updated: 2026-09-09
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "missing capability + decision paralysis + coordination overhead + data trapped somewhere (all apply)"
    - topic: "insight"
      decision: "structured competency model + AI-generated personalized plans beats generic training catalogs / static skills matrices"
    - topic: "primary persona"
      decision: "Employee is primary; Competence Leader is secondary"
    - topic: "cost today"
      decision: "manual/ad-hoc assessment (spreadsheets, informal conversation, or nothing), no systematic gap analysis"
    - topic: "auth model"
      decision: "login (email/password or org SSO — mechanism TBD downstream); two roles: Employee and Competence Leader"
    - topic: "account provisioning"
      decision: "pre-provisioned accounts and leader assignments, not self-registration"
    - topic: "dual role"
      decision: "a person can hold both roles independently (e.g. a Competence Leader is also assessed as an Employee by their own leader)"
    - topic: "MVP flow scope"
      decision: "9-step flow (self-assess → submit → leader review/adjust/approve → gap ID + AI plan generation → employee views plan) confirmed shippable in a few days; no scope-down needed"
    - topic: "success criteria"
      decision: "Primary = the 9-step flow works end-to-end; Secondary = leaders report the data is genuinely useful for staffing decisions; Guardrails = data visibility, non-bypassable approval, plan relevance"
  frs_drafted: 17
  quality_check_status: accepted
timeline_budget:
  mvp_weeks: 1
  hard_deadline: null
  after_hours_only: false
product_type: web-app
target_scale:
  users: small
---

# Shape Notes: SkillManager

## Vision & Problem Statement

In a matrix organization, employees and their Competence Leaders lack a structured, objective way to assess skills, identify the most important competency gaps, and turn that into an actionable development plan. Today this happens manually and ad-hoc — via spreadsheets, informal conversations, or not at all — so gaps go unidentified, development plans (when they exist) are generic rather than personalized, and Competence Leaders have no objective data to ground staffing decisions or development conversations. The pain spans several failure modes at once: a missing capability (no structured assessment-to-plan pipeline exists today), decision paralysis (staffing and development choices are made without comparable data), coordination overhead (a matrix structure means no single role has a clear view of who can do what across teams), and data trapped somewhere (competency information lives in people's heads or scattered documents, never aggregated).

A structured competency model, combined with AI-generated personalized multi-month development plans, produces more actionable outcomes than either a generic training catalog or a static skills matrix: it identifies the specific gaps that matter for each employee and turns them directly into concrete recommended actions, while the leader-approval step on top of self-assessment makes the resulting data trustworthy enough to use for real people-development and staffing decisions.

## User & Persona

**Primary persona: Employee** — an individual contributor working across projects in a matrix organization. They reach for this product during a competency assessment cycle: rating their own skills against a defined competency model, then later receiving a personalized, AI-generated multi-month development plan built from their approved gaps.

### Secondary persona: Competence Leader

Reviews and approves an employee's self-assessment, and uses the resulting objective data (individual gaps, team-wide competency coverage) to ground development conversations and project staffing decisions.

## Success Criteria

### Primary

- The end-to-end flow works: an Employee self-assesses against the competency model, submits it; their Competence Leader reviews/adjusts and approves it; the system identifies competency gaps and triggers AI generation of a development plan; the Employee sees the generated plan with recommended development activities.

### Secondary

- Competence Leaders report that the aggregated gap data is genuinely useful for staffing and development decisions — not just a workflow that runs, but data they'd actually act on.

### Guardrails

- Assessment data (ratings, gaps) stays visible only to the employee and their own Competence Leader — not to unrelated leaders or other employees.
- A development plan can only be generated from an approved assessment — the approval step is not bypassable.
- The AI-generated plan's recommended actions must relate to the employee's actual approved gaps — it must not recommend actions wildly irrelevant to what was assessed.

## User Stories

### US-01: Employee receives a personalized development plan after an approved assessment

- **Given** an Employee has rated themselves against the competency model and submitted the assessment, and their Competence Leader has reviewed and approved it
- **When** the system processes the approved assessment
- **Then** it identifies the Employee's competency gaps and generates a personalized development plan

#### Acceptance Criteria
- The plan is only generated after Competence Leader approval — never from a draft or submitted-but-unapproved assessment
- The identified gaps reflect the difference between the approved assessment's scores and the competency model's expected proficiency levels
- The Employee can view the generated plan, and its recommended development activities are tied to their identified gaps, not generic advice unrelated to their assessment
- The Competence Leader can also view the generated plan for their report

## Functional Requirements

### Competency Model
- FR-001: Employee can view the competency model applicable to them. Priority: must-have
  > Socrates: Counter-argument considered: "a single competency model may not fit everyone in a matrix org where roles vary widely." Resolution: kept; PoC assumes each employee maps to exactly one applicable competency model based on their role — supporting multiple/role-specific models is a known limitation, acceptable for PoC scope.
- FR-002: The system defines each competency with a name, description, and expected proficiency level. Priority: must-have

### Self-Assessment
- FR-003: Employee can create a self-assessment. Priority: must-have
  > Socrates: Counter-argument considered: "if the competency model changes, in-progress or past assessments risk referencing a stale version." Resolution: kept; each assessment is tied to the competency model version in effect when it was created, so later model changes don't retroactively alter past assessments.
- FR-004: Employee can score each competency in their assessment. Priority: must-have
- FR-005: Employee can add an optional comment to a score. Priority: nice-to-have
  > Socrates: Counter-argument considered: "optional comments are low-value effort relative to other must-have gaps for the MVP." Resolution: kept as nice-to-have — already out of must-have scope; first to drop if time runs short.
- FR-006: Employee can save an assessment as a draft before submitting. Priority: must-have
- FR-007: Employee can submit a completed assessment for review. Priority: must-have
  > Socrates: Counter-argument considered: "'completed' isn't defined, so a partially-filled assessment could be submitted and produce misleading gaps." Resolution: kept; submission requires a score on every competency in the model — that's the operational definition of "completed."

### Review & Approval
- FR-008: Competence Leader can see assessments submitted by Employees they are responsible for. Priority: must-have
- FR-009: Competence Leader can review Employee scores. Priority: must-have
- FR-010: Competence Leader can provide their own assessment/comments on the submission. Priority: must-have
- FR-011: Competence Leader can approve the assessment. Priority: must-have
- FR-012: Competence Leader can return the assessment for correction. Priority: nice-to-have
  > Socrates: Counter-argument considered: "an unbounded return-for-correction loop could stall the pipeline indefinitely." Resolution: kept as nice-to-have; no retry limit enforced for the PoC — acceptable risk given the small pilot group.

### Gap Identification
- FR-013: The system can compare the approved assessment against the expected competency level. Priority: must-have
- FR-014: The system can identify competency gaps from that comparison. Priority: must-have

### Development Plan
- FR-015: The system can generate a development plan based on identified gaps. Priority: must-have
  > Socrates: Counter-argument considered: "AI-generated plans risk being generic boilerplate that doesn't reflect the employee's real context, undermining the PoC's core hypothesis." Resolution: kept; this is exactly what the Secondary success criterion (leaders find the data useful) is designed to test — if plans turn out generic, that's a PoC finding, not a reason to skip building it.
- FR-016: Employee can view the generated development plan. Priority: must-have
- FR-017: Competence Leader can view the generated development plan. Priority: must-have

## Non-Functional Requirements

- An employee's assessment data, identified gaps, and development plan are visible only to that employee and their own Competence Leader — no other employee or unrelated leader can see them.

## Business Logic

The system identifies gaps between an employee's approved proficiency scores and each competency's expected proficiency level, prioritizes the largest gaps, and generates practical development actions for the top 3 gaps aimed at closing them.

It consumes the employee's approved self-assessment scores (reviewed and approved by their Competence Leader) together with the expected proficiency level defined for each competency in the applicable competency model. Its output is a ranked list of competency gaps, ordered largest to smallest, with the top 3 each paired with one or more concrete recommended development actions targeting that specific gap.

The employee encounters this immediately after their Competence Leader approves the assessment: the identified gaps and generated actions appear together as their personalized development plan. The Competence Leader can view the same plan for their report.

## Access Control

Login-based (mechanism — e.g. email/password vs org SSO — is a downstream tech-stack decision, not captured here). Two roles: **Employee** and **Competence Leader**. A single person can hold both roles independently — e.g. a Competence Leader is also assessed as an Employee by their own leader further up the matrix.

Accounts and leader-assignment relationships are pre-provisioned (not self-registration) — appropriate for a PoC with a known pilot group.

Role → capability matrix:

| Capability | Employee | Competence Leader |
| --- | --- | --- |
| Self-assess own skills against the competency model | ✅ | ✅ (for their own assessment, as an Employee) |
| Review & approve/reject a direct report's self-assessment | ❌ | ✅ |
| View own identified competency gaps | ✅ | ✅ (own) |
| View team-level competency gaps/coverage | ❌ | ✅ |
| Receive AI-generated personalized development plan | ✅ | ✅ (own) |
| View direct reports' development plans | ❌ | ✅ |

An unauthenticated user hitting any gated route is redirected to login.

## Non-Goals

- **No multiple/role-specific competency models** — a single competency model per employee for MVP; no per-role or per-seniority model variants yet (known limitation, already flagged in FR-001's Socrates note).
- **No custom recommendation/scoring algorithm built from scratch** — lean on an existing AI capability for plan generation rather than engineering a bespoke recommendation engine (specific choice is a downstream tech-stack decision).
- **No employee feedback/rating on the generated plan** — view-only for MVP; this limits how directly plan usefulness can be measured, but a feedback loop is out of scope for now.
- **No org-wide rollout or self-service account creation** — locked to a pre-provisioned small pilot group; no self-registration, no broad rollout in this PoC.
- **No full accessibility (WCAG-AA) compliance** — not a target for this PoC given the small, known pilot group.

## Open Questions

_(none yet)_
