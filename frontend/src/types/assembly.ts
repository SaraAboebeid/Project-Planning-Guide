/* Minimal shapes the assembly cost/carbon helpers need, kept separate so the
   util doesn't pull in the whole Wikells catalogue module. */

export type { BoverketResource } from "./index";

/** The fields of a Wikells catalogue row used for nearest-assembly costing. */
export interface WikellsItemLike {
  code: string;
  description: string;
  costSEK: number;
  uValue?: number;
}
