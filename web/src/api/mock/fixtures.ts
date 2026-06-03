import { faker } from './seed';
import {
  makePerson,
  makeSprint,
  makeRisk,
  makeDecision,
  makeBlocker,
  makeForecast,
  makeTraceChain,
  makeWeeklyReport,
} from './generators';
import type { Project, PortfolioSummary, Risk, TraceNode } from '@app-types';

// ─── Falcon Payments (at-risk — mirror approved mockup) ───────────────────────
function makeFalconPayments(): Project {
  const id = 'proj-falcon-payments';
  const key = 'FAL';

  const lead = makePerson({ name: 'Ayesha Raza', initials: 'AR', role: 'Engineering Lead' });

  const sprints = [
    makeSprint(key, 0),
    makeSprint(key, 1),
    makeSprint(key, 2),
    makeSprint(key, 3),
  ];

  // Exact risks from the approved mockup
  const riskFAL412: Risk = {
    id: faker.datatype.uuid(),
    projectId: id,
    kind: 'delivery',
    severity: 'high',
    title: 'Stalled critical-path story',
    subjectRef: 'FAL-412',
    evidence: 'FAL-412 has been in-progress for 14 days without a commit. Critical path dependency.',
    recommendation: 'Assign a pair programmer and escalate to product owner immediately.',
  };

  const riskFAL388: Risk = {
    id: faker.datatype.uuid(),
    projectId: id,
    kind: 'scope_creep',
    severity: 'medium',
    title: 'Scope creep in payments module',
    subjectRef: 'FAL-388',
    evidence: 'FAL-388 has added 3 new acceptance criteria post-grooming, expanding estimated effort by 40%.',
    recommendation: 'Hold a scope review session; defer non-essential criteria to a follow-on story.',
  };

  const riskFAL401: Risk = {
    id: faker.datatype.uuid(),
    projectId: id,
    kind: 'dependency',
    severity: 'medium',
    title: 'External payment gateway API instability',
    subjectRef: 'FAL-401',
    evidence: 'Third-party gateway returning 5xx errors on 8% of calls in staging environment.',
    recommendation: 'Implement retry logic and escalate with vendor SLA team.',
  };

  const risks = [riskFAL412, riskFAL388, riskFAL401];

  // Narrative with embedded [[KEY]] tokens per spec
  const narrative =
    'Sprint 4 velocity has declined for the third consecutive cycle, driven primarily by [[FAL-412]] remaining stalled on the critical path for 14 days. ' +
    'Scope expansion captured in [[FAL-388]] has introduced 40% additional effort post-grooming, straining the sprint commitment. ' +
    'The external payment gateway instability (see [[FAL-401]]) adds integration risk to the upcoming release candidate. ' +
    'Immediate attention is required on FAL-412 to avoid missing the September delivery window.';

  const report = makeWeeklyReport(id, key, risks, {
    narrative,
    dataCompleteness: 87,
    summary: {
      done: 11,
      inProgress: 6,
      todo: 14,
      blocked: 2,
      pointsCompleted: 34,
      pointsCommitted: 42,
    },
  });

  const trace = buildFalconTrace();

  // Forecast: expected ~Sep 12 ±6 days
  const expected = new Date('2026-09-12');
  const low = new Date('2026-09-06');
  const high = new Date('2026-09-18');

  return {
    id,
    key,
    name: 'Falcon Payments',
    lead,
    status: 'at-risk',
    lastSyncedAt: faker.date.recent(1).toISOString(),
    health: {
      overall: 72,
      label: 'at-risk',
      subScores: { scope: 64, timeline: 66, velocity: 81, techRisk: 74 },
    },
    sprint: sprints[sprints.length - 1],
    risks,
    decisions: [
      makeDecision({ statement: 'Adopt idempotency keys for all payment API endpoints.', adrRef: 'ADR-007' }),
      makeDecision({ statement: 'Defer 3D-Secure v2 support to post-launch iteration.' }),
      makeDecision({ statement: 'Migrate token storage to HSM-backed vault solution.', adrRef: 'ADR-009' }),
    ],
    blockers: [
      makeBlocker({ title: 'Legal approval pending for PCI-DSS data processing addendum', owner: 'Ayesha Raza' }),
    ],
    forecast: {
      expected: expected.toISOString(),
      low: low.toISOString(),
      high: high.toISOString(),
      confidence: 68,
      basisSprints: [sprints[1].id, sprints[2].id, sprints[3].id],
    },
    report,
    trace,
    velocityHistory: [38, 41, 37, 34, 34],
  };
}

function buildFalconTrace(): TraceNode[] {
  const key = 'FAL';
  const reqId = `${key}-TR-REQ-01`;
  const epicId = `${key}-TR-EPC-02`;
  const storyId = `${key}-TR-STR-03`;
  const storyId2 = `${key}-TR-STR-04`;
  const taskId = `${key}-TR-TSK-05`;
  const taskId2 = `${key}-TR-TSK-06`;
  const prId = `${key}-TR-PR-07`;
  const deployId = `${key}-TR-DEP-08`;
  const releaseId = `${key}-TR-REL-09`;

  return [
    { id: reqId, type: 'requirement', label: `[${reqId}] PCI-DSS compliant payment processing`, parentId: null, status: 'ok' },
    { id: epicId, type: 'epic', label: `[${epicId}] Payment gateway integration`, parentId: reqId, status: 'ok' },
    { id: storyId, type: 'story', label: `[FAL-412] Implement tokenization for card data`, parentId: epicId, status: 'in-progress' },
    { id: storyId2, type: 'story', label: `[FAL-388] Scope-expanded checkout flow`, parentId: epicId, status: 'in-progress' },
    { id: taskId, type: 'task', label: `[${taskId}] Write unit tests for tokenization service`, parentId: storyId, status: 'ok' },
    { id: taskId2, type: 'task', label: `[${taskId2}] Update API schema for new checkout fields`, parentId: storyId2, status: 'ok' },
    { id: prId, type: 'pr', label: `[${prId}] PR: Add tokenization service`, parentId: taskId, status: 'ok' },
    { id: deployId, type: 'deployment', label: `[${deployId}] Deploy to staging env`, parentId: prId, status: 'ok' },
    { id: releaseId, type: 'release', label: `[${releaseId}] Release v2.4.0-rc1`, parentId: deployId, status: 'ok' },
    // 2 orphan nodes
    { id: `${key}-TR-STR-ORF1`, type: 'story', label: `[${key}-TR-STR-ORF1] Orphaned story: legacy refund flow`, parentId: null, status: 'orphan' },
    { id: `${key}-TR-TSK-ORF2`, type: 'task', label: `[${key}-TR-TSK-ORF2] Orphaned task: update FX rate caching`, parentId: null, status: 'orphan' },
  ];
}

// ─── Orion CRM (healthy) ──────────────────────────────────────────────────────
function makeOrionCRM(): Project {
  const id = 'proj-orion-crm';
  const key = 'ORI';
  const lead = makePerson({ name: 'Marcus Webb', initials: 'MW', role: 'Tech Lead' });
  const sprints = [makeSprint(key, 0), makeSprint(key, 1), makeSprint(key, 2)];
  const risks = [
    makeRisk(id, key, { severity: 'low', kind: 'dependency', title: 'Minor API version mismatch in CRM integration' }),
  ];
  const report = makeWeeklyReport(id, key, risks);
  const trace = makeTraceChain(key);
  return {
    id,
    key,
    name: 'Orion CRM',
    lead,
    status: 'healthy',
    lastSyncedAt: faker.date.recent(1).toISOString(),
    health: {
      overall: 91,
      label: 'healthy',
      subScores: { scope: 89, timeline: 93, velocity: 90, techRisk: 88 },
    },
    sprint: sprints[sprints.length - 1],
    risks,
    decisions: [makeDecision(), makeDecision()],
    blockers: [],
    forecast: makeForecast(sprints.map((s) => s.id), { confidence: 85 }),
    report,
    trace,
    velocityHistory: [42, 44, 46, 45, 47],
  };
}

// ─── Atlas Mobile (blocked) ───────────────────────────────────────────────────
function makeAtlasMobile(): Project {
  const id = 'proj-atlas-mobile';
  const key = 'ATL';
  const lead = makePerson({ name: 'Fatima Al-Sayed', initials: 'FA', role: 'Delivery Manager' });
  const sprints = [makeSprint(key, 0), makeSprint(key, 1), makeSprint(key, 2), makeSprint(key, 3)];
  const risks = [
    makeRisk(id, key, { severity: 'high', kind: 'delivery', title: 'App store review delayed by policy change' }),
    makeRisk(id, key, { severity: 'high', kind: 'resource_overload', title: 'Two lead engineers out simultaneously' }),
    makeRisk(id, key, { severity: 'medium', kind: 'dependency', title: 'Push notification service migration incomplete' }),
  ];
  const report = makeWeeklyReport(id, key, risks, {
    summary: { done: 5, inProgress: 3, todo: 18, blocked: 5, pointsCompleted: 14, pointsCommitted: 40 },
  });
  const trace = makeTraceChain(key);
  return {
    id,
    key,
    name: 'Atlas Mobile',
    lead,
    status: 'blocked',
    lastSyncedAt: faker.date.recent(2).toISOString(),
    health: {
      overall: 43,
      label: 'blocked',
      subScores: { scope: 55, timeline: 32, velocity: 38, techRisk: 60 },
    },
    sprint: sprints[sprints.length - 1],
    risks,
    decisions: [makeDecision(), makeDecision()],
    blockers: [
      makeBlocker({ title: 'App Store review process halted pending policy compliance review', owner: 'Fatima Al-Sayed' }),
      makeBlocker({ title: 'Critical engineers on medical leave — no backup coverage', owner: 'HR Team' }),
    ],
    forecast: makeForecast(sprints.map((s) => s.id), { confidence: 35 }),
    report,
    trace,
    velocityHistory: [36, 30, 22, 14, 12],
  };
}

// ─── Nimbus Data (healthy) ────────────────────────────────────────────────────
function makeNimbusData(): Project {
  const id = 'proj-nimbus-data';
  const key = 'NIM';
  const lead = makePerson({ name: 'Chen Li', initials: 'CL', role: 'Engineering Lead' });
  const sprints = [makeSprint(key, 0), makeSprint(key, 1), makeSprint(key, 2)];
  const risks = [
    makeRisk(id, key, { severity: 'low', kind: 'scope_creep', title: 'Additional reporting requirements from stakeholders' }),
  ];
  const report = makeWeeklyReport(id, key, risks);
  const trace = makeTraceChain(key);
  return {
    id,
    key,
    name: 'Nimbus Data',
    lead,
    status: 'healthy',
    lastSyncedAt: faker.date.recent(1).toISOString(),
    health: {
      overall: 88,
      label: 'healthy',
      subScores: { scope: 85, timeline: 90, velocity: 88, techRisk: 84 },
    },
    sprint: sprints[sprints.length - 1],
    risks,
    decisions: [makeDecision(), makeDecision(), makeDecision()],
    blockers: [],
    forecast: makeForecast(sprints.map((s) => s.id), { confidence: 82 }),
    report,
    trace,
    velocityHistory: [40, 43, 44, 46, 45],
  };
}

// ─── Vega Portal (at-risk) ────────────────────────────────────────────────────
function makeVegaPortal(): Project {
  const id = 'proj-vega-portal';
  const key = 'VEG';
  const lead = makePerson({ name: 'Jordan Kimani', initials: 'JK', role: 'Product Manager' });
  const sprints = [makeSprint(key, 0), makeSprint(key, 1), makeSprint(key, 2)];
  const risks = [
    makeRisk(id, key, { severity: 'high', kind: 'delivery', title: 'Design handoffs consistently late', subjectRef: 'VEG-217' }),
    makeRisk(id, key, { severity: 'medium', kind: 'resource_overload', title: 'Frontend team over-allocated across three workstreams', subjectRef: 'VEG-203' }),
  ];
  const report = makeWeeklyReport(id, key, risks);
  const trace = makeTraceChain(key);
  return {
    id,
    key,
    name: 'Vega Portal',
    lead,
    status: 'at-risk',
    lastSyncedAt: faker.date.recent(1).toISOString(),
    health: {
      overall: 67,
      label: 'at-risk',
      subScores: { scope: 72, timeline: 60, velocity: 65, techRisk: 70 },
    },
    sprint: sprints[sprints.length - 1],
    risks,
    decisions: [makeDecision()],
    blockers: [
      makeBlocker({ title: 'Awaiting UX sign-off on portal redesign', owner: 'Jordan Kimani' }),
    ],
    forecast: makeForecast(sprints.map((s) => s.id), { confidence: 58 }),
    report,
    trace,
    velocityHistory: [35, 33, 30, 28, 26],
  };
}

// ─── Kepler Analytics (new/low-data — exercises empty states) ─────────────────
function makeKeplerAnalytics(): Project {
  const id = 'proj-kepler-analytics';
  const key = 'KEP';
  const lead = makePerson({ name: 'Priya Sharma', initials: 'PS', role: 'Scrum Master' });
  const sprints = [makeSprint(key, 0)];
  const trace: TraceNode[] = []; // intentionally empty — exercises empty state

  const report: import('@app-types').WeeklyReport = {
    projectId: id,
    periodEnd: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    dataCompleteness: 12,
    summary: { done: 0, inProgress: 1, todo: 5, blocked: 0, pointsCompleted: 0, pointsCommitted: 8 },
    narrative: 'Kepler Analytics is in the kickoff phase. Insufficient sprint history to generate a meaningful narrative.',
    completed: [],
    inProgress: [{ key: 'KEP-001', title: 'Project setup and repository scaffolding', assignee: 'Priya Sharma' }],
    staleStories: [],
    idlePrs: [],
    risks: [],
  };

  return {
    id,
    key,
    name: 'Kepler Analytics',
    lead,
    status: 'healthy',
    lastSyncedAt: new Date().toISOString(),
    health: {
      overall: 0,
      label: 'healthy',
      subScores: { scope: 0, timeline: 0, velocity: 0, techRisk: 0 },
    },
    sprint: sprints[0],
    risks: [],
    decisions: [],
    blockers: [],
    forecast: {
      expected: faker.date.future(0.5).toISOString(),
      low: faker.date.future(0.4).toISOString(),
      high: faker.date.future(0.6).toISOString(),
      confidence: 10,
      basisSprints: [],
    },
    report,
    trace,
    velocityHistory: [8],
  };
}

// ─── Build fixtures (called once at module load time) ─────────────────────────
export const PROJECTS: Project[] = [
  makeFalconPayments(),
  makeOrionCRM(),
  makeAtlasMobile(),
  makeNimbusData(),
  makeVegaPortal(),
  makeKeplerAnalytics(),
];

// ─── Derive portfolio summary ─────────────────────────────────────────────────
const allRisks = PROJECTS.flatMap((p) => p.risks);

export const PORTFOLIO: PortfolioSummary = {
  projects: PROJECTS.map(({ id, key, name, status, health }) => ({ id, key, name, status, health })),
  riskByKind: {
    delivery: allRisks.filter((r) => r.kind === 'delivery').length,
    scope_creep: allRisks.filter((r) => r.kind === 'scope_creep').length,
    dependency: allRisks.filter((r) => r.kind === 'dependency').length,
    resource_overload: allRisks.filter((r) => r.kind === 'resource_overload').length,
  },
  throughput: { window: 'last 2 weeks', merged: faker.datatype.number({ min: 18, max: 42 }), trend: faker.datatype.number({ min: -15, max: 20 }) },
  executiveSummary:
    '2 of 6 projects are at-risk and 1 is blocked. Falcon Payments requires immediate intervention on FAL-412. ' +
    'Atlas Mobile is gated on external app store approval. Orion CRM and Nimbus Data are on track. ' +
    'Portfolio velocity is trending down — recommend reducing WIP limits across the at-risk projects.',
};
