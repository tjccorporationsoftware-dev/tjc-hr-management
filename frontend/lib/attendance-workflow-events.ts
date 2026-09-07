export const ATTENDANCE_WORKFLOW_CHANGED_EVENT =
  "hr-workforce:attendance-workflow-changed";
export const ATTENDANCE_WORKFLOW_CHANGED_STORAGE_KEY =
  "hr-workforce:attendance-workflow-changed:storage";

const WORKFLOW_EVENT_DEBOUNCE_MS = 1200;
const WORKFLOW_EVENT_SOURCE_ID = createWorkflowSourceId();
let workflowEventSequence = 0;

export type AttendanceWorkflowChangePayload = {
  path?: string | null;
  method?: string | null;
  source?: string | null;
  changedAt: string;
  eventId?: string | null;
  sourceTabId?: string | null;
};

function createWorkflowSourceId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createWorkflowEventId() {
  workflowEventSequence += 1;
  return `${WORKFLOW_EVENT_SOURCE_ID}:${Date.now()}:${workflowEventSequence}`;
}

function workflowChangedAtMs(payload: AttendanceWorkflowChangePayload) {
  const changedAt = Date.parse(payload.changedAt);
  return Number.isFinite(changedAt) ? changedAt : Date.now();
}

export function getAttendanceWorkflowChangedAt(
  payload: AttendanceWorkflowChangePayload,
) {
  return workflowChangedAtMs(payload);
}

export function notifyAttendanceWorkflowChanged(
  input: Omit<
    AttendanceWorkflowChangePayload,
    "changedAt" | "eventId" | "sourceTabId"
  > = {},
) {
  if (typeof window === "undefined") return;

  const payload: AttendanceWorkflowChangePayload = {
    ...input,
    changedAt: new Date().toISOString(),
    eventId: createWorkflowEventId(),
    sourceTabId: WORKFLOW_EVENT_SOURCE_ID,
  };

  window.dispatchEvent(
    new CustomEvent<AttendanceWorkflowChangePayload>(
      ATTENDANCE_WORKFLOW_CHANGED_EVENT,
      { detail: payload },
    ),
  );

  try {
    window.localStorage.setItem(
      ATTENDANCE_WORKFLOW_CHANGED_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Cross-tab broadcast is best effort. Same-tab CustomEvent still works.
  }
}

export function subscribeAttendanceWorkflowChanged(
  listener: (payload: AttendanceWorkflowChangePayload) => void,
  options: { includeSameTab?: boolean } = {},
) {
  if (typeof window === "undefined") return () => undefined;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingPayload: AttendanceWorkflowChangePayload | null = null;
  const seenEventIds = new Set<string>();

  const rememberEvent = (eventId?: string | null) => {
    if (!eventId) return false;
    if (seenEventIds.has(eventId)) return true;

    seenEventIds.add(eventId);
    if (seenEventIds.size > 100) {
      const oldest = seenEventIds.values().next().value;
      if (oldest) seenEventIds.delete(oldest);
    }
    return false;
  };

  const emit = (payload: AttendanceWorkflowChangePayload) => {
    if (
      options.includeSameTab === false &&
      payload.sourceTabId === WORKFLOW_EVENT_SOURCE_ID
    ) {
      return;
    }
    if (rememberEvent(payload.eventId)) return;

    if (
      !pendingPayload ||
      workflowChangedAtMs(payload) >= workflowChangedAtMs(pendingPayload)
    ) {
      pendingPayload = payload;
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const nextPayload = pendingPayload;
      pendingPayload = null;
      timer = null;
      if (nextPayload) listener(nextPayload);
    }, WORKFLOW_EVENT_DEBOUNCE_MS);
  };

  const handleCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<AttendanceWorkflowChangePayload>).detail;
    emit(
      detail ?? {
        changedAt: new Date().toISOString(),
      },
    );
  };

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== ATTENDANCE_WORKFLOW_CHANGED_STORAGE_KEY ||
      !event.newValue
    ) {
      return;
    }

    try {
      emit(JSON.parse(event.newValue) as AttendanceWorkflowChangePayload);
    } catch {
      emit({ changedAt: new Date().toISOString() });
    }
  };

  window.addEventListener(ATTENDANCE_WORKFLOW_CHANGED_EVENT, handleCustomEvent);
  window.addEventListener("storage", handleStorage);

  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener(
      ATTENDANCE_WORKFLOW_CHANGED_EVENT,
      handleCustomEvent,
    );
    window.removeEventListener("storage", handleStorage);
  };
}

export function isAttendanceWorkflowMutation(path: string, method?: string) {
  const normalizedMethod = String(method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) return false;

  return [
    "/attendance",
    "/leaves/requests",
    "/leave/requests",
    "/overtime/requests",
    "/offsite-work/requests",
    "/time-adjust/requests",
    "/ess/leave",
    "/ess/overtime",
    "/ess/time-adjust",
    "/ess/offsite",
  ].some((prefix) => path.includes(prefix));
}
