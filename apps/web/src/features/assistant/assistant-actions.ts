export const assistantActionEvent = "carbon-flow-assistant-action";
export const assistantActionStorageKey = "carbon-flow-pending-assistant-action";

export type AssistantActionId =
  | "create-budget"
  | "create-customer"
  | "create-ingredient"
  | "create-product"
  | "open-stock-list"
  | "open-stock-movement";

export function clearStoredAssistantAction(actionId?: AssistantActionId) {
  if (typeof window === "undefined") {
    return;
  }

  const storedAction = window.sessionStorage.getItem(
    assistantActionStorageKey
  );

  if (!actionId || storedAction === actionId) {
    window.sessionStorage.removeItem(assistantActionStorageKey);
  }
}

export function emitAssistantAction(actionId: AssistantActionId) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AssistantActionId>(assistantActionEvent, {
      detail: actionId
    })
  );
}

export function getStoredAssistantAction() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(
    assistantActionStorageKey
  ) as AssistantActionId | null;
}

export function storeAssistantAction(actionId: AssistantActionId) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(assistantActionStorageKey, actionId);
}
