# Security Incident Response Plan for RewardsPro

## Overview

This document outlines the security incident response procedures for the RewardsPro application, providing a structured approach to detecting, responding to, and recovering from security incidents.

## Incident Response Team Structure

```
┌────────────────────────────────┐
│    Incident Commander (IC)      │
├────────────────────────────────┤
│     Security Lead (SL)          │
├────────────────────────────────┤
│   Engineering Lead (EL)         │
├────────────────────────────────┤
│  Communications Lead (CL)       │
├────────────────────────────────┤
│    Legal/Compliance (LC)        │
└────────────────────────────────┘
```

## Incident Severity Levels

### SEV-1: Critical
- **Definition**: Complete system compromise, data breach, or service outage
- **Examples**: 
  - **Authentication system compromise (88% of breaches)**
  - **Mass session hijacking detected**
  - **JWT signing key compromise**
  - Customer data breach
  - Store credit manipulation at scale
  - Complete authentication bypass
  - Ransomware attack
- **Response Time**: Immediate (< 15 minutes)
- **Escalation**: CEO, CTO, Legal, PR

### SEV-2: High
- **Definition**: Significant security vulnerability or partial compromise
- **Examples**:
  - SQL injection vulnerability in production
  - Individual account compromise
  - Suspicious webhook activity
  - Failed HMAC validations spike
- **Response Time**: < 1 hour
- **Escalation**: CTO, Security Lead

### SEV-3: Medium
- **Definition**: Security issue with limited impact
- **Examples**:
  - XSS vulnerability in non-critical feature
  - Dependency vulnerability (non-critical)
  - Failed authentication attempts
  - Rate limiting triggered
- **Response Time**: < 4 hours
- **Escalation**: Security Lead, Engineering Lead

### SEV-4: Low
- **Definition**: Minor security issues or false positives
- **Examples**:
  - Security scanner false positive
  - Documentation security issues
  - Test environment vulnerabilities
- **Response Time**: < 24 hours
- **Escalation**: Engineering team

## Incident Response Phases

### Phase 1: Detection & Analysis (0-30 minutes)

#### Detection Sources
```typescript
// app/monitoring/security-detection.ts
export const detectionSources = {
  automated: [
    'Sentry alerts',
    'CloudWatch alarms',
    'WAF blocks',
    'Rate limiter triggers',
    'Failed authentication spikes'
  ],
  manual: [
    'Customer reports',
    'Internal discovery',
    'Security scan results',
    'Audit log anomalies'
  ],
  external: [
    'Shopify security team',
    'Bug bounty reports',
    'Security researchers',
    'Third-party notifications'
  ]
};
```

#### Initial Assessment Checklist
- [ ] Verify the incident is real (not false positive)
- [ ] Determine severity level (SEV-1 to SEV-4)
- [ ] Identify affected systems/data
- [ ] Document initial observations
- [ ] Activate incident response team
- [ ] Create incident ticket/channel

#### Detection Queries
```sql
-- Check for SQL injection attempts
SELECT 
  timestamp,
  user_id,
  request_path,
  request_body
FROM security_logs
WHERE 
  request_body LIKE '%DROP%' OR
  request_body LIKE '%UNION%' OR
  request_body LIKE '%SELECT%FROM%'
  AND timestamp > NOW() - INTERVAL '1 hour';

-- Check for credit manipulation
SELECT 
  c.id,
  c.email,
  SUM(scl.amount) as total_credits,
  COUNT(scl.id) as transaction_count
FROM customers c
JOIN store_credit_ledger scl ON c.id = scl.customer_id
WHERE scl.created_at > NOW() - INTERVAL '1 hour'
GROUP BY c.id, c.email
HAVING SUM(scl.amount) > 10000
  OR COUNT(scl.id) > 100;

-- Check for authentication anomalies
SELECT 
  shop,
  COUNT(*) as failed_attempts,
  MAX(timestamp) as last_attempt
FROM auth_logs
WHERE 
  status = 'FAILED'
  AND timestamp > NOW() - INTERVAL '15 minutes'
GROUP BY shop
HAVING COUNT(*) > 10;
```

### Phase 2: Containment (30 minutes - 2 hours)

#### Immediate Containment Actions

##### For Data Breaches
```bash
# 1. Isolate affected systems
aws rds modify-db-cluster \
  --db-cluster-identifier rewardspro-prod \
  --no-publicly-accessible

# 2. Revoke compromised credentials
npm run security:revoke-tokens

# 3. Enable emergency WAF rules
aws wafv2 update-web-acl \
  --scope REGIONAL \
  --id $WAF_ACL_ID \
  --lock-token $LOCK_TOKEN \
  --rules file://emergency-rules.json
```

##### For Application Vulnerabilities
```typescript
// app/utils/emergency-shutdown.ts
export async function enableEmergencyMode(
  feature: 'CREDIT_OPERATIONS' | 'TIER_MANAGEMENT' | 'WEBHOOK_PROCESSING'
) {
  // Set feature flag
  await db.featureFlags.upsert({
    where: { name: feature },
    create: {
      name: feature,
      enabled: false,
      reason: 'Security incident response',
      disabledAt: new Date()
    },
    update: {
      enabled: false,
      reason: 'Security incident response',
      disabledAt: new Date()
    }
  });
  
  // Notify affected systems
  await notifyDownstream(feature);
  
  // Log action
  await logSecurityAction('EMERGENCY_SHUTDOWN', {
    feature,
    timestamp: new Date(),
    initiatedBy: getCurrentUser()
  });
}
```

#### Short-term Containment
1. **Implement temporary fixes**
   ```typescript
   // Temporary input validation
   app.use((req, res, next) => {
     if (containsSuspiciousPattern(req.body)) {
       return res.status(400).json({ error: 'Invalid input' });
     }
     next();
   });
   ```

2. **Enable additional monitoring**
   ```typescript
   // Enhanced logging
   app.use((req, res, next) => {
     securityLogger.info({
       type: 'INCIDENT_MONITORING',
       path: req.path,
       method: req.method,
       headers: sanitizeHeaders(req.headers),
       body: sanitizeBody(req.body),
       ip: getClientIp(req)
     });
     next();
   });
   ```

3. **Increase rate limiting**
   ```typescript
   rateLimiters.api.points = 10; // Reduce from 100
   rateLimiters.auth.points = 2; // Reduce from 5
   ```

### Phase 3: Eradication (2-8 hours)

#### Root Cause Analysis
```markdown
# Root Cause Analysis Template

## Incident ID: INC-2025-001
## Date: YYYY-MM-DD
## Severity: SEV-X

### What Happened?
[Detailed description of the incident]

### Timeline
- HH:MM - Event 1
- HH:MM - Event 2
- HH:MM - Resolution

### Root Cause
[Primary cause of the incident]

### Contributing Factors
1. [Factor 1]
2. [Factor 2]

### Impact
- Affected Users: X
- Data Exposed: [Type and amount]
- Downtime: X minutes
- Financial Impact: $X

### Lessons Learned
1. [Lesson 1]
2. [Lesson 2]

### Action Items
- [ ] Fix vulnerability
- [ ] Update monitoring
- [ ] Training needed
- [ ] Process improvement
```

#### Vulnerability Remediation

##### Code Fixes
```typescript
// Before (vulnerable)
const query = `SELECT * FROM customers WHERE email = '${userInput}'`;

// After (secure)
const query = 'SELECT * FROM customers WHERE email = $1';
const result = await db.query(query, [userInput]);
```

##### Configuration Updates
```yaml
# Update security policies
- name: enhanced-security-policy
  rules:
    - block-sql-injection
    - block-xss-attempts
    - enforce-rate-limits
    - validate-webhooks
```

### Phase 4: Recovery (8-24 hours)

#### System Restoration Checklist
- [ ] Verify vulnerability is patched
- [ ] Run security tests
- [ ] Restore normal operations gradually
- [ ] Monitor for recurrence
- [ ] Verify data integrity
- [ ] Update documentation

#### Gradual Service Restoration
```typescript
// app/utils/service-restoration.ts
export async function restoreService(
  service: string,
  percentage: number // 0-100
) {
  // Enable for percentage of users
  await db.featureFlags.update({
    where: { name: service },
    data: {
      enabled: true,
      rolloutPercentage: percentage,
      restoredAt: new Date()
    }
  });
  
  // Monitor for issues
  const monitoring = setInterval(async () => {
    const errors = await checkServiceHealth(service);
    if (errors > threshold) {
      await restoreService(service, 0); // Rollback
      clearInterval(monitoring);
    }
  }, 60000); // Check every minute
  
  // Gradually increase if stable
  if (percentage < 100) {
    setTimeout(() => {
      restoreService(service, Math.min(100, percentage + 10));
    }, 3600000); // Increase by 10% every hour
  }
}
```

### Phase 5: Post-Incident Activities (24-72 hours)

#### Incident Report Template
```markdown
# Incident Report: [INCIDENT_ID]

## Executive Summary
[1-2 paragraph summary for leadership]

## Technical Details
### Vulnerability
- Type: [e.g., SQL Injection, XSS]
- CVSS Score: X.X
- CWE ID: CWE-XXX
- OWASP Category: [e.g., A03:2021]

### Attack Vector
[How the vulnerability was exploited]

### Indicators of Compromise (IoCs)
- IP Addresses: [List]
- User Agents: [List]
- Patterns: [List]

## Response Actions
1. [Action 1 with timestamp]
2. [Action 2 with timestamp]

## Remediation
- Code changes: [PR links]
- Configuration updates: [Details]
- Monitoring additions: [Details]

## Impact Assessment
- Customer Impact: [Number affected]
- Data Impact: [Types of data]
- Service Impact: [Downtime/degradation]
- Compliance Impact: [GDPR, PCI, etc.]

## Recommendations
1. [Short-term recommendation]
2. [Long-term recommendation]

## Appendices
- Log samples
- Code diffs
- Communication logs
```

#### Customer Communication Templates

##### Initial Notification
```markdown
Subject: Important Security Update - RewardsPro

Dear [Customer Name],

We are writing to inform you of a security incident that may have affected your account.

**What Happened:**
[Brief, clear description]

**Information Involved:**
[Specific data types potentially affected]

**What We've Done:**
- Immediate containment measures
- Patched the vulnerability
- Enhanced monitoring

**What You Should Do:**
- [Specific action 1]
- [Specific action 2]

**For More Information:**
Contact: security@rewardspro.app
Reference: [INCIDENT_ID]

Sincerely,
RewardsPro Security Team
```

##### Follow-up Communication
```markdown
Subject: Security Incident Update - RewardsPro

Dear [Customer Name],

This is a follow-up regarding the security incident we previously communicated.

**Current Status:**
[Resolution status]

**Additional Actions Taken:**
[List of improvements]

**Compensation/Credits:**
[If applicable]

Thank you for your patience and continued trust.

Sincerely,
RewardsPro Security Team
```

## Incident Response Playbooks

### Playbook: SQL Injection Attack

```yaml
name: SQL Injection Response
severity: SEV-1
steps:
  - detect:
      - Check WAF logs for SQL patterns
      - Review database query logs
      - Identify affected endpoints
  
  - contain:
      - Enable WAF SQL injection rules
      - Block source IPs
      - Disable affected endpoints
  
  - investigate:
      - Review code for vulnerabilities
      - Check for data exfiltration
      - Analyze attack patterns
  
  - eradicate:
      - Patch vulnerable code
      - Update input validation
      - Deploy fixes
  
  - recover:
      - Re-enable services
      - Monitor for recurrence
      - Update security tests
```

### Playbook: Store Credit Manipulation

```yaml
name: Credit Manipulation Response
severity: SEV-1
steps:
  - detect:
      - Monitor credit ledger anomalies
      - Check for unusual patterns
      - Identify affected accounts
  
  - contain:
      - Freeze affected accounts
      - Disable credit operations
      - Snapshot database
  
  - investigate:
      - Trace transaction history
      - Identify exploitation method
      - Calculate impact
  
  - eradicate:
      - Fix vulnerability
      - Correct balances
      - Add validation
  
  - recover:
      - Restore operations
      - Audit all accounts
      - Enhance monitoring
```

### Playbook: Authentication Bypass

```yaml
name: Auth Bypass Response
severity: SEV-1
steps:
  - detect:
      - Monitor auth logs
      - Check session anomalies
      - Identify unauthorized access
  
  - contain:
      - Invalidate all sessions
      - Force re-authentication
      - Block suspicious IPs
  
  - investigate:
      - Review auth flow
      - Check token validation
      - Analyze bypass method
  
  - eradicate:
      - Fix auth vulnerability
      - Enhance validation
      - Update security headers
  
  - recover:
      - Re-enable authentication
      - Monitor login patterns
      - Update documentation
```

## Contact Information

### Internal Contacts
| Role | Name | Phone | Email | Slack |
|------|------|-------|-------|-------|
| Incident Commander | TBD | +1-XXX-XXX-XXXX | ic@rewardspro.app | @ic |
| Security Lead | TBD | +1-XXX-XXX-XXXX | security@rewardspro.app | @security |
| Engineering Lead | TBD | +1-XXX-XXX-XXXX | eng@rewardspro.app | @eng-lead |
| Communications | TBD | +1-XXX-XXX-XXXX | comms@rewardspro.app | @comms |
| Legal | TBD | +1-XXX-XXX-XXXX | legal@rewardspro.app | @legal |

### External Contacts
| Organization | Purpose | Contact | Available |
|--------------|---------|---------|-----------|
| Shopify Security | Platform issues | security@shopify.com | 24/7 |
| AWS Support | Infrastructure | [Support Center] | 24/7 |
| Sentry | Monitoring | support@sentry.io | Business hours |
| Legal Counsel | Legal advice | counsel@lawfirm.com | 24/7 emergency |

### Escalation Path
1. **Level 1** (0-15 min): Engineering on-call
2. **Level 2** (15-30 min): Security Lead
3. **Level 3** (30-60 min): CTO
4. **Level 4** (60+ min): CEO

## Compliance Requirements

### GDPR (EU Customers)
- **Notification**: Within 72 hours to supervisory authority
- **Customer notification**: Without undue delay if high risk
- **Documentation**: Maintain incident records

### PCI DSS (Payment Data)
- **Notification**: Card brands and acquirer immediately
- **Forensic investigation**: Required for card data breaches
- **Compliance validation**: Re-certification may be required

### CCPA (California Customers)
- **Notification**: Without unreasonable delay
- **Attorney General**: If > 500 California residents affected
- **Content requirements**: Specific information required

## Training & Drills

### Monthly Drills
- Tabletop exercises
- Communication tests
- Tool familiarity

### Quarterly Simulations
- Full incident simulation
- Cross-team coordination
- External communication

### Annual Training
- Security awareness
- Incident response procedures
- Tool certifications

---

*Last Updated: January 2025 | Security Level: HIGH | Classification: Internal*
*Emergency Hotline: [TO BE CONFIGURED]*