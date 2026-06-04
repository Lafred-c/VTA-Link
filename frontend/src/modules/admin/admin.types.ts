export type Period = "today" | "week" | "month" | "3months" | "year" | "all";
export type ChartType = "revenue" | "volume" | "collection";

export interface Bucket {
  label: string;
  start: Date;
  end: Date;
}
