import { faker } from './seed';
import type {
  Person,
  Sprint,
  Risk,
  Decision,
  Blocker,
  TimelineForecast,
  TraceNode,
  WeeklyReport,
  RiskKind,
  Severity,
  TraceType,
  ReportItem,
} from '@app-types';

export function makePerson(overrides?: Partial<Person>): Person {
  const firstName = faker.name.firstName();
  const lastName = faker.name.lastName();
  return {
    id: faker.datatype.uuid(),
    name: `${firstName} ${lastName}`,
    initials: `${firstName[0]}${lastName[0]}`.toUpperCase(),
    role: faker.helpers.arrayElement(['Engineering Lead', 'Product Manager', 'Scrum Master', 'Tech Lead', 'Delivery Manager']),
    ...overrides,
  };
}

export function makeSprint(projectKey: string, index: number): Sprint {
  const start = faker.date.recent(14 + index * 14);
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  const committed = faker.datatype.number({ min: 20, max: 50 });
  return {
    id: `${projectKey}-S${index + 1}`,
    name: `Sprint ${index + 1}`,
    committed,
    completed: faker.datatype.number({ min: Math.floor(committed * 0.5), max: committed }),
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function makeRisk(projectId: string, projectKey: string, overrides?: Partial<Risk>): Risk {
  const kind: RiskKind = faker.helpers.arrayElement(['delivery', 'scope_creep', 'dependency', 'resource_overload']);
  const severity: Severity = faker.helpers.arrayElement(['low', 'medium', 'high']);
  const issueNum = faker.datatype.number({ min: 100, max: 999 });
  return {
    id: faker.datatype.uuid(),
    projectId,
    kind,
    severity,
    title: faker.helpers.arrayElement([
      'Stalled critical-path story',
      'Unresolved dependency on external team',
      'Sprint velocity declining over 3 sprints',
      'Scope creep in authentication module',
      'Key engineer on extended leave',
      'Unreviewed PRs blocking deployment',
      'Missing acceptance criteria on epics',
      'Test coverage below threshold',
    ]),
    subjectRef: `${projectKey}-${issueNum}`,
    evidence: `Issue ${projectKey}-${issueNum} has been unresolved for ${faker.datatype.number({ min: 3, max: 21 })} days.`,
    recommendation: faker.helpers.arrayElement([
      'Escalate to product owner and unblock immediately.',
      'Schedule dependency resolution meeting this sprint.',
      'Re-estimate and de-scope low-priority items.',
      'Add buffer to sprint commitment for next cycle.',
      'Identify backup resource or redistribute tasks.',
    ]),
    ...overrides,
  };
}

export function makeDecision(overrides?: Partial<Decision>): Decision {
  return {
    id: faker.datatype.uuid(),
    date: faker.date.recent(60).toISOString(),
    statement: faker.helpers.arrayElement([
      'Migrate authentication to OAuth 2.0 PKCE flow.',
      'Adopt hexagonal architecture for service layer.',
      'Defer dark mode to Q3 given current scope pressure.',
      'Use feature flags for incremental rollout.',
      'Upgrade to Node 22 LTS before end of quarter.',
      'Establish weekly risk review cadence with stakeholders.',
      'Consolidate micro-services into domain aggregates.',
      'Implement automated regression suite before next release.',
    ]),
    adrRef: faker.helpers.maybe(() => `ADR-${faker.datatype.number({ min: 1, max: 30 }).toString().padStart(3, '0')}`, { probability: 0.6 }),
    ...overrides,
  };
}

export function makeBlocker(overrides?: Partial<Blocker>): Blocker {
  return {
    id: faker.datatype.uuid(),
    title: faker.helpers.arrayElement([
      'Waiting on legal approval for data processing agreement',
      'External API provider not responding to integration queries',
      'Infrastructure provisioning pending cloud team review',
      'Security audit sign-off delayed',
      'Design sign-off pending stakeholder availability',
    ]),
    since: faker.date.recent(10).toISOString(),
    owner: faker.name.fullName(),
    ...overrides,
  };
}

export function makeForecast(sprintIds: string[], overrides?: Partial<TimelineForecast>): TimelineForecast {
  const expected = faker.date.future(0.25);
  const low = new Date(expected.getTime() - faker.datatype.number({ min: 7, max: 21 }) * 24 * 60 * 60 * 1000);
  const high = new Date(expected.getTime() + faker.datatype.number({ min: 7, max: 21 }) * 24 * 60 * 60 * 1000);
  return {
    expected: expected.toISOString(),
    low: low.toISOString(),
    high: high.toISOString(),
    confidence: faker.datatype.number({ min: 55, max: 90 }),
    basisSprints: faker.helpers.arrayElements(sprintIds, Math.min(sprintIds.length, faker.datatype.number({ min: 2, max: 4 }))),
    ...overrides,
  };
}

export function makeTraceChain(projectKey: string): TraceNode[] {
  const types: TraceType[] = ['requirement', 'epic', 'story', 'task', 'pr', 'deployment', 'release'];
  const nodes: TraceNode[] = [];

  // Build a connected chain
  let prevId: string | null = null;
  for (const type of types) {
    const id = `${projectKey}-TR-${type.toUpperCase().slice(0, 3)}-${faker.datatype.number({ min: 10, max: 99 })}`;
    nodes.push({
      id,
      type,
      label: `[${id}] ${faker.helpers.arrayElement([
        'User authentication flow',
        'Payment processing module',
        'Dashboard analytics feature',
        'Notification service',
        'API gateway integration',
        'Data pipeline setup',
        'Mobile onboarding',
        'Search and filter',
      ])}`,
      parentId: prevId,
      status: 'ok',
    });
    prevId = id;
  }

  // Add 2 orphan nodes (story and task type without valid parent)
  nodes.push({
    id: `${projectKey}-TR-STR-ORF1`,
    type: 'story',
    label: `[${projectKey}-TR-STR-ORF1] Orphaned story (no linked epic)`,
    parentId: null,
    status: 'orphan',
  });
  nodes.push({
    id: `${projectKey}-TR-TSK-ORF2`,
    type: 'task',
    label: `[${projectKey}-TR-TSK-ORF2] Orphaned task (no parent story)`,
    parentId: null,
    status: 'orphan',
  });

  return nodes;
}

export function makeReportItem(projectKey: string): ReportItem {
  const num = faker.datatype.number({ min: 100, max: 999 });
  return {
    key: `${projectKey}-${num}`,
    title: faker.helpers.arrayElement([
      'Implement password reset flow',
      'Fix race condition in event handler',
      'Add pagination to list endpoint',
      'Update dependency versions',
      'Write unit tests for service layer',
      'Resolve memory leak in worker process',
      'Add rate limiting to API gateway',
      'Improve error handling in data sync',
    ]),
    assignee: faker.name.fullName(),
  };
}

export function makeWeeklyReport(
  projectId: string,
  projectKey: string,
  risks: Risk[],
  overrides?: Partial<WeeklyReport>,
): WeeklyReport {
  const committed = faker.datatype.number({ min: 20, max: 45 });
  const done = faker.datatype.number({ min: Math.floor(committed * 0.4), max: committed });
  const inProgressCount = faker.datatype.number({ min: 2, max: 8 });
  const blockedCount = faker.datatype.number({ min: 0, max: 3 });
  const pointsCompleted = faker.datatype.number({ min: Math.floor(committed * 0.3), max: committed });

  const completed = Array.from({ length: done }, () => makeReportItem(projectKey));
  const inProgressItems = Array.from({ length: inProgressCount }, () => makeReportItem(projectKey));
  const staleStories = Array.from({ length: faker.datatype.number({ min: 0, max: 3 }) }, () => makeReportItem(projectKey));

  const idlePrs = Array.from({ length: faker.datatype.number({ min: 0, max: 3 }) }, () => ({
    id: `${projectKey}-PR-${faker.datatype.number({ min: 10, max: 99 })}`,
    daysIdle: faker.datatype.number({ min: 2, max: 14 }),
  }));

  // Pick a couple issue keys for narrative tokens
  const allKeys = [...completed, ...inProgressItems].map((i) => i.key).slice(0, 3);
  const narrativeTokens = allKeys.map((k) => `[[${k}]]`).join(', ');

  const narrative = `This week the team completed ${done} stories, advancing the sprint goal by closing key items including ${narrativeTokens}. Velocity remains ${pointsCompleted >= Math.floor(committed * 0.75) ? 'strong' : 'below target'} at ${pointsCompleted} of ${committed} committed points. ${blockedCount > 0 ? `There are ${blockedCount} blocked item(s) requiring immediate attention.` : 'No blockers reported this cycle.'} The team is tracking toward the forecast delivery date with ${risks.filter((r) => r.severity === 'high').length} high-severity risk(s) open.`;

  return {
    projectId,
    periodEnd: faker.date.recent(7).toISOString(),
    generatedAt: new Date().toISOString(),
    dataCompleteness: faker.datatype.number({ min: 72, max: 98 }),
    summary: {
      done,
      inProgress: inProgressCount,
      todo: faker.datatype.number({ min: 5, max: 20 }),
      blocked: blockedCount,
      pointsCompleted,
      pointsCommitted: committed,
    },
    narrative,
    completed,
    inProgress: inProgressItems,
    staleStories,
    idlePrs,
    risks,
    ...overrides,
  };
}
