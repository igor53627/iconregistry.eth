# Security Audits

## Nethermind AuditAgent - December 2025

| Document | Description |
|----------|-------------|
| [audit_agent_report_6.pdf](audit_agent_report_6_af2d625d-1034-4ffa-ad45-3c1bb46e9a5b.pdf) | Full audit report (PDF) |
| [iconregistry_audit_report_1.json](iconregistry_audit_report_1.json) | Machine-readable findings |
| [audit_response.md](audit_response.md) | Our response to findings |

### Summary

| Severity | Count | Status |
|----------|-------|--------|
| High | 0 | - |
| Medium | 0 | - |
| Low | 6 | All false positives or won't fix |
| Info | 2 | Won't fix (by design) |
| Best Practices | 1 | Fixed |

### Fixed Issues

| Finding | Severity | Fix |
|---------|----------|-----|
| Missing Events for Withdrawals | Best Practices | [Issue #2](https://github.com/igor53627/iconregistry.eth/issues/2) - Added `ETHWithdrawn` and `TokenWithdrawn` events |

### False Positives / Won't Fix

See [audit_response.md](audit_response.md) for detailed explanations of why findings 1-8 were marked as false positives or won't fix.

## Scope

Contracts audited:
- `contracts/IconRegistry.sol`
- `contracts/IIconRegistry.sol`

## Disclaimer

The Audit Agent is in beta. Results may not be complete. This is not a substitute for a full manual security audit.
