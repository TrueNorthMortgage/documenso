// Preserve existing call sites while product analytics and session recording are disabled.
const capture = (_event: string, _properties?: Record<string, unknown>) => {};
const captureException = (_error: Error, _properties?: Record<string, unknown>) => {};
const startSessionRecording = (_eventFlag?: string) => {};
const stopSessionRecording = () => {};

export const useAnalytics = () => ({
  capture,
  captureException,
  startSessionRecording,
  stopSessionRecording,
});
