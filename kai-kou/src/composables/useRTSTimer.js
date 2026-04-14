import { onUnmounted } from "vue";
import { usePracticeStore } from "@/stores/practice";

export function useRTSTimer() {
  const practiceStore = usePracticeStore();
  let prepareTimerId = null;
  let recordTimerId = null;

  function clearTimer(timerName) {
    if (timerName === "prepare") {
      clearInterval(prepareTimerId);
      prepareTimerId = null;
      return;
    }

    if (timerName === "record") {
      clearInterval(recordTimerId);
      recordTimerId = null;
    }
  }

  function stopPrepareCountdown() {
    clearTimer("prepare");
  }

  function stopRecordCountdown() {
    clearTimer("record");
  }

  function startPrepareCountdown(seconds = 15, onFinish) {
    clearTimer("prepare");
    const total = Math.max(1, Math.round(Number(seconds || 15)));
    let remaining = total;
    practiceStore.setRTSPrepareTimer(remaining, total);

    prepareTimerId = setInterval(() => {
      remaining -= 1;
      practiceStore.setRTSPrepareTimer(Math.max(0, remaining), total);
      if (remaining <= 0) {
        clearTimer("prepare");
        if (typeof onFinish === "function") onFinish();
      }
    }, 1000);
  }

  function startRecordCountdown(seconds = 40, onFinish) {
    clearTimer("record");
    const total = Math.max(1, Math.round(Number(seconds || 40)));
    let remaining = total;
    practiceStore.setRTSRecordTimer(remaining, total);

    recordTimerId = setInterval(() => {
      remaining -= 1;
      practiceStore.setRTSRecordTimer(Math.max(0, remaining), total);
      if (remaining <= 0) {
        clearTimer("record");
        if (typeof onFinish === "function") onFinish();
      }
    }, 1000);
  }

  function stopAllCountdowns() {
    clearTimer("prepare");
    clearTimer("record");
  }

  onUnmounted(() => {
    stopAllCountdowns();
  });

  return {
    startPrepareCountdown,
    startRecordCountdown,
    stopPrepareCountdown,
    stopRecordCountdown,
    stopAllCountdowns
  };
}
