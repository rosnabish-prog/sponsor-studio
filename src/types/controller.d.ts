declare global {
  interface Window {
    skipVideo?: (seconds: number) => void;
    attachLocalVideoFile?: (file: File) => boolean;
  }
}
export {};
