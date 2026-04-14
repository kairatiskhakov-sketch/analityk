/** Ответ Bitrix REST (усечённо) */
export type BitrixRestResponse<T> = {
  result?: T;
  next?: number;
  total?: number;
  time?: { start: number; finish: number; duration: number; processing: number; date_start: string; date_finish: string };
  error?: string;
  error_description?: string;
};

export type BitrixLeadRow = Record<string, unknown>;

export type BitrixDealRow = Record<string, unknown>;

export type BitrixUserRow = {
  ID?: string | number;
  NAME?: string;
  LAST_NAME?: string;
  EMAIL?: string;
  /** Bitrix: Y/N или boolean */
  ACTIVE?: boolean | string | number;
};

export type BitrixStatusRow = {
  STATUS_ID?: string;
  NAME?: string;
  SORT?: number | string;
  COLOR?: string;
  /** S = success, F = failure, P/I = in progress (Bitrix) */
  SEMANTICS?: string;
  ENTITY_ID?: string;
};
