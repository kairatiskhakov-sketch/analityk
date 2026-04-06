export type TelegramNotificationType =
  | "NEW_LEAD"
  | "DEAL_WON"
  | "DEAL_LOST"
  | "DAILY_REPORT"
  | "PLAN_ALERT"
  | "NEW_MANAGER_LEAD";

export type NewLeadNotificationData = {
  name: string;
  phone?: string;
  source: string;
  amount?: number;
  managerName?: string;
  crmUrl?: string;
};

export type DealNotificationData = {
  name: string;
  amount: number;
  managerName?: string;
  reason?: string;
};

export type DailyReportData = {
  date: string;
  leadsCount: number;
  soldCount: number;
  soldAmount: number;
  lostCount: number;
  inProgressCount: number;
  bestManager?: string;
};

export type PlanAlertData = {
  daysLeft: number;
  gapAmount: number;
  dailyPace: number;
  neededPerDay: number;
};
