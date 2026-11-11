export type GP = {
  seed: number; level: number; twist: string | null;
  onWin: () => void; onFail: (why: string) => void;
  /** costs time on the task clock (e.g. peeking at a manual) */
  penalize: (ms: number) => void;
};
