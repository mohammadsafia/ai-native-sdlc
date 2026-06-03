import { type ComponentPropsWithoutRef, type FC, Fragment } from 'react';

import { cn } from '@utils';
import type { WeeklyReport } from '@app-types';
import Card from '@components/ui/card/Card';
import EvidenceChip from '@components/shared/evidence-chip/EvidenceChip';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export interface ReportNarrativeProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  report: WeeklyReport;
}

/**
 * Splits a narrative string into segments: either plain text or [[TOKEN]] references.
 */
function parseNarrative(text: string): Array<{ type: 'text' | 'chip'; content: string }> {
  const regex = /\[\[([^\]]+)\]\]/g;
  const segments: Array<{ type: 'text' | 'chip'; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'chip', content: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Renders a narrative string where [[KEY]] tokens become inline EvidenceChip components.
 * Splits on double-newlines to produce paragraphs.
 */
function NarrativeBody({ narrative }: { narrative: string }) {
  const paragraphs = narrative.split(/\n{2,}/);

  return (
    <>
      {paragraphs.map((para, pi) => {
        const segments = parseNarrative(para);
        return (
          <p key={pi} className="text-sm leading-relaxed text-foreground">
            {segments.map((seg, si) =>
              seg.type === 'chip' ? (
                <Fragment key={si}>
                  {' '}
                  <EvidenceChip label={seg.content} />
                  {' '}
                </Fragment>
              ) : (
                <Fragment key={si}>{seg.content}</Fragment>
              ),
            )}
          </p>
        );
      })}
    </>
  );
}

const ReportNarrative: FC<ReportNarrativeProps> = ({ report, className, ...props }) => {
  const { narrative, summary, dataCompleteness, generatedAt } = report;
  const groundingText = [
    `${summary.done + summary.inProgress + summary.todo + summary.blocked} issues`,
    `${summary.pointsCompleted}/${summary.pointsCommitted} pts`,
    `${Math.round(dataCompleteness * 100)}% data completeness`,
  ].join(' · ');

  return (
    <div data-slot="report-narrative" className={cn('flex flex-col gap-0', className)} {...props}>
      <Card>
        <Card.Header className="flex flex-row items-start justify-between gap-2 pb-3">
          <Card.Title className="text-base font-semibold">Weekly Narrative</Card.Title>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-15 px-2 py-0.5 text-xs font-medium text-primary">
            ✦ AI-generated
          </span>
        </Card.Header>

        <Card.Content className="flex flex-col gap-4 pt-0">
          <NarrativeBody narrative={narrative} />
        </Card.Content>

        <Card.Footer className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            Grounded in {groundingText}
          </span>
          <span className="text-xs text-muted-foreground/60">
            Generated {dayjs(generatedAt).fromNow()}
          </span>
        </Card.Footer>
      </Card>
    </div>
  );
};

export default ReportNarrative;
