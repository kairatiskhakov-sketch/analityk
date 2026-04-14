/** Ответы API при отсутствии активного CRM — без чтения демо/лидов из БД */

export const EMPTY_LEAD_METRICS = {
  total: 0,
  won: 0,
  lost: 0,
  inProgress: 0,
  salesAmount: 0,
} as const;

export const EMPTY_FUNNEL = {
  stages: [] as const,
  summary: {
    total: 0,
    new: 0,
    in_progress: 0,
    won: 0,
    lost: 0,
  },
} as const;
