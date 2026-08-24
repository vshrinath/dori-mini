# Meeting Summary Prompt

Summarize this meeting transcript for someone who did not attend. This is a standalone record — assume the reader has no prior context about the discussion, participants, or background.

## Required Sections

### Meeting Metadata
- **Date:** [Extract from transcript or infer]
- **Duration:** [If available]
- **Type:** Internal sync / External call / Decision meeting / Other
- **Purpose:** One sentence — why was this meeting held?

### Attendees
List all participants:
- **[Name]** — Role or affiliation (e.g., "Acme Corp, Editor" or "Acme Corp, Product Lead")

Flag for review: If any attendee's role or affiliation is unclear from the transcript, list them under a separate "Unclear Attribution" heading for manual correction.

### Topics Discussed

For each major topic:

**[Topic Title]**

**Context:** Why was this raised? (1-2 sentences)

**[Subtopic 1]:** Details, speaker positions, reasoning. Attribute to speakers where ownership or disagreement matters.

**[Subtopic 2]:** Additional details, examples, frameworks referenced.

**Outcome:** What was decided, agreed, or left open?

Use bold subtopic labels for skimmability. Keep each subtopic to 2-4 sentences. Avoid dense paragraphs.

Flag for review: If speaker attribution is ambiguous, note inline: `[Attribution unclear: ...]`

### Technical Specifications (if applicable)

When the meeting involves system design, architecture, data structures, workflows, or technical decisions, extract and present them visually.

Include:
- Folder/file structures (as code blocks)
- Role and permission matrices (as tables)
- Workflow diagrams (as numbered steps or ASCII)
- Data schemas or field definitions (as tables)
- API contracts or integration points

Format as code blocks or tables—not prose. Label ambiguities inline.

Omit this section entirely if the meeting has no technical content.

### Decisions Log
List each decision as a single line:
- **[Topic]:** Decision made — Owner (if assigned)

Include only firm commitments, not tentative directions.

### Key Insights
- Strategic observations that emerged
- Turning points in the discussion
- Reframings or new perspectives introduced

Keep to 2-4 bullets. Each insight should be 1-2 sentences.

### Action Items

Group by person in this exact format:

**[Person Name]**
- [ ] Task description | Deadline: [date or "TBD"] | Depends on: [person/item, or "None"]

Include all commitments, even informal ones. If a task cannot proceed until another task or input is complete, note the dependency.

If someone is assigned tasks but was not present in the meeting, note: `[Not in attendance — inferred from discussion]`

### Dependencies & Blockers
- External inputs needed from non-attendees
- Approvals or decisions required before progress
- Systemic blockers affecting multiple action items

### Unresolved Questions
- Open issues explicitly deferred
- Questions raised but not answered
- Items requiring follow-up discussion

### Follow-up
- **Next meeting:** [Date/time or "Not scheduled"]
- **Async follow-ups:** [List if any]

### Glossary
Define terms, acronyms, project names, or internal references that a reader unfamiliar with this team/context would not understand. Omit section if none needed.

## Output Rules

### Frontmatter (required — output this first, before any heading)

```yaml
---
date: 'YYYY-MM-DD'
title: "Meeting title"
type: meeting
people:
  - first-last               # one slug per attendee, lowercase hyphenated; include all named participants
topics:
  - topic-slug                # 3-8 short theme slugs extracted from Topics Discussed; lowercase hyphenated
fathom_recording_id: "123"    # only when sourced via fetch-fathom.mjs — omit for pasted transcripts
---
```

**people** — derive from the Attendees section. Format: `firstname-lastname`. Include every named person.

**topics** — extract 3-8 concise theme slugs from the Topics Discussed section. Choose terms that would be useful as filters across many meetings. Prefer stable, reusable terms over meeting-specific ones.

---

- Markdown format
- Use bold subtopic labels throughout Topics Discussed for skimmability
- Speaker attribution where ownership or disagreement matters
- Technical specifications in code blocks or tables, not prose
- Action items must follow exact format (enables downstream automation)
- Write for a reader with no prior context
- Flag ambiguities rather than guessing
- Aim for 1500-2500 words depending on meeting complexity
