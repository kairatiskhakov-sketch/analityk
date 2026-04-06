/** Ответ OAuth amoCRM */
export type AmoTokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
};

/** Лид v4 (фрагмент) */
export type AmoLead = {
  id: number;
  name: string;
  price: number;
  responsible_user_id: number;
  status_id: number;
  pipeline_id: number;
  loss_reason_id?: number | null;
  created_at: number;
  updated_at: number;
  closed_at?: number | null;
  custom_fields_values?: AmoCustomFieldValue[];
  _embedded?: {
    contacts?: AmoContact[];
    loss_reason?: AmoLossReason[];
    tags?: unknown[];
  };
};

export type AmoLossReason = {
  id: number;
  name?: string;
};

export type AmoContact = {
  id: number;
  name?: string;
  custom_fields_values?: AmoCustomFieldValue[];
};

export type AmoCustomFieldValue = {
  field_id?: number;
  field_name?: string;
  field_code?: string | null;
  values?: { value?: string | number }[];
};

export type AmoPipeline = {
  id: number;
  name: string;
  _embedded?: {
    statuses?: AmoStatus[];
  };
};

export type AmoStatus = {
  id: number;
  name: string;
  sort: number;
  /** 0 — обычный, 1 — успешно, 2 — провал (в актуальной схеме API) */
  type?: number;
  pipeline_id: number;
};

export type AmoUser = {
  id: number;
  name: string;
  email?: string;
};
