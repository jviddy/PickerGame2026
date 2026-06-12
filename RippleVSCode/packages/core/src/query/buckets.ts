import type { TaskRecord } from '../types.js';

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export const BUCKET_ORDER: DueBucket[] = ['overdue', 'today', 'week', 'later', 'none'];

export const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  none: 'No date',
};

/** Classify a task's due date relative to `today` (ISO YYYY-MM-DD). */
export function bucketForDue(due: string | null, today: string): DueBucket {
  if (!due) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= addDays(today, 7)) return 'week';
  return 'later';
}

export function groupTasksByBucket(tasks: TaskRecord[], today: string): Map<DueBucket, TaskRecord[]> {
  const groups = new Map<DueBucket, TaskRecord[]>();
  for (const bucket of BUCKET_ORDER) groups.set(bucket, []);
  for (const task of tasks) {
    groups.get(bucketForDue(task.due, today))!.push(task);
  }
  return groups;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
