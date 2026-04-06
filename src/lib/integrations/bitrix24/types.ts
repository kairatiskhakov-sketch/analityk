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
  ID?: string;
  NAME?: string;
  LAST_NAME?: string;
  EMAIL?: string;
};

export type BitrixStatusRow = {
  STATUS_ID?: string;
  NAME?: string;
};
