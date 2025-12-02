# Audit Processing Command

Process a new security audit report and create GitHub issues for findings.

## Instructions

There is a new report in `audits/`. For each high, medium, or low priority finding:

1. **Create a GitHub issue** for the finding using `gh issue create`
2. **Consult the Oracle** about the proposed solution and add it as a comment on the issue
3. **If it's a false positive**, add it to `audits/audit_response.md` instead of creating an issue
4. **Request a third opinion** from Kimi2 skill to review each issue and comment, then post the response as a comment on the GitHub issue

## Workflow

1. Read the latest audit report in `audits/`
2. Parse each finding (High, Medium, Low severity)
3. For each finding:
   - Determine if it's a valid finding or false positive
   - If valid: create GitHub issue with `gh issue create --title "..." --body "..." --label "security"`
   - Ask Oracle for remediation advice
   - Add Oracle's response as a comment: `gh issue comment <number> --body "..."`
   - Ask Kimi2 skill for third opinion
   - Add Kimi2's response as a comment
   - If false positive: document in `audits/audit_response.md` with explanation

## Commands

Use GitHub CLI (`gh`) for all GitHub interactions:
- `gh issue create --title "Title" --body "Body" --label "security,high|medium|low"`
- `gh issue comment <issue-number> --body "Comment text"`
- `gh issue list` to check existing issues
