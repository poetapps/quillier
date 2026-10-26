import { useMemo } from 'react';
import { useStore } from '../store.js';
import { buildContext, analyze, scoped } from './bible.js';

// The story bible as seen from the open book, the mention analysis, and the current scope.
export function useBible() {
  const project = useStore((s) => s.project);
  const series = useStore((s) => s.series);
  const verdicts = useStore((s) => s.smart.verdicts);
  const scope = useStore((s) => s.bible.scope);
  const ctx = useMemo(() => buildContext(project, series), [project, series]);
  const analysis = useMemo(() => analyze(ctx, verdicts), [ctx, verdicts]);
  const effective = ctx.inSeries ? scope : 'book';
  const view = useMemo(() => scoped(ctx, analysis, effective), [ctx, analysis, effective]);
  return { ctx, analysis, view, scope: effective };
}
