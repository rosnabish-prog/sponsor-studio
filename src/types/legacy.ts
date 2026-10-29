/** Synchronous commit so legacy handlers can immediately access mounted DOM. */
export type LegacyMount = (markup: string, afterCommit?: () => void) => void;
