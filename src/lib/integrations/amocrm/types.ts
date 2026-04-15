/** Ответ OAuth amoCRM */
export type AmoTokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
};

export interface AmoCustomField {
  field_id: number;
  field_name: string;
  field_code: string | null;
  field_type: string;
  values: { value: string | number; enum_id?: number; enum_code?: string }[];
}

export interface AmoLead {
  id: number;
  name: string;
  price: number;
  responsible_user_id: number;
  group_id: number;
  status_id: number;
  pipeline_id: number;
  loss_reason_id: number | null;
  source_id?: number | null;
  created_by: number;
  updated_by: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  closest_task_at?: number | null;
  is_deleted: boolean;
  custom_fields_values: AmoCustomField[] | null;
  score?: number | null;
  account_id: number;
  labor_cost?: number | null;
  _embedded?: {
    contacts?: AmoContact[];
    loss_reason?: { id: number; name: string }[];
    pipeline?: { id: number; name: string };
    tags?: { id: number; name: string }[];
  };
}

/** backward-compatible alias */
export type AmoCustomFieldValue = AmoCustomField;

export type AmoLossReason = {
  id: number;
  name?: string;
};

export type AmoContact = {
  id: number;
  name?: string;
  custom_fields_values?: AmoCustomField[];
};

export interface AmoStatus {
  id: number;
  name: string;
  sort: number;
  is_editable: boolean;
  pipeline_id: number;
  color: string;
  type: number;
  account_id: number;
}

export interface AmoPipeline {
  id: number;
  name: string;
  sort: number;
  is_main: boolean;
  is_unsorted_on: boolean;
  is_archive: boolean;
  account_id: number;
  _embedded: {
    statuses: AmoStatus[];
  };
}

export type AmoUser = {
  id: number;
  name: string;
  email?: string;
};
