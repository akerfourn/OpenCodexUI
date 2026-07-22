import { Notification } from "electron";
import type {
  Event,
  Notification as ElectronNotification,
  NotificationConstructorOptions
} from "electron";

import type {
  OpenCodexApproval,
  OpenCodexApprovalDecision,
  OpenCodexEvent,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

type NativeNotification = Pick<ElectronNotification, "show" | "close"> & {
  on(event: "click", listener: (event: Event) => void): NativeNotification;
  on(event: "close", listener: (event: Event) => void): NativeNotification;
  on(event: "action", listener: (event: Event, index: number) => void): NativeNotification;
};

type DesktopNotificationServiceOptions = {
  settings: OpenCodexSettings;
  focusWindow(): void;
  navigateToThread(sourceId: string | null, threadId: string): void;
  resolveApproval(approvalId: string, decision: OpenCodexApprovalDecision): void;
  logger(message: string): void;
  createNotification?: (options: NotificationConstructorOptions) => NativeNotification;
  isSupported?: () => boolean;
  platform?: NodeJS.Platform;
};

type ApprovalAction = {
  decision: OpenCodexApprovalDecision;
  label: string;
};

/**
 * Displays native notifications while keeping approval resolution on the
 * existing backend/UI approval path.
 */
export class DesktopNotificationService {
  private settings: OpenCodexSettings;
  private readonly platform: NodeJS.Platform;
  private readonly activeApprovalNotifications = new Map<string, NativeNotification>();
  private readonly shownCompletedTurns = new Set<string>();
  private hasCheckedSupport = false;
  private isSupported = false;

  /**
   * Creates the desktop notification service.
   *
   * @param options Native notification and navigation callbacks.
   */
  constructor(private readonly options: DesktopNotificationServiceOptions) {
    this.settings = options.settings;
    this.platform = options.platform ?? process.platform;
  }

  /**
   * Replaces the settings used for future notifications.
   *
   * @param settings Effective application settings.
   */
  setSettings(settings: OpenCodexSettings): void {
    this.settings = settings;
  }

  /**
   * Handles one application event emitted by the backend bridge.
   *
   * @param event Event to inspect.
   */
  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "turn.completed":
        this.handleTurnCompleted(event);
        return;
      case "approval.requested":
        this.handleApprovalRequested(event.approval);
        return;
      case "approval.resolved":
        this.closeApprovalNotification(event.approvalId);
        return;
      default:
        return;
    }
  }

  /**
   * Closes native notifications and releases service state.
   */
  dispose(): void {
    for (const notification of this.activeApprovalNotifications.values()) {
      notification.close();
    }

    this.activeApprovalNotifications.clear();
    this.shownCompletedTurns.clear();
  }

  /**
   * Shows a notification only for a genuinely successful turn completion.
   *
   * @param event Completed-turn event emitted by the Codex notification mapper.
   */
  private handleTurnCompleted(
    event: Extract<OpenCodexEvent, { type: "turn.completed" }>
  ): void {
    if (
      !this.settings.desktopNotifications.turnCompleted ||
      event.turnStatus !== "completed"
    ) {
      return;
    }

    const key = createTurnNotificationKey(event.sourceId ?? null, event.threadId, event.turnId);

    if (this.shownCompletedTurns.has(key) || !this.rememberCompletedTurn(key)) {
      return;
    }

    this.showNotification(
      {
        title: this.translate("Réponse terminée", "Response completed"),
        body: this.translate(
          "Codex a terminé une réponse. Cliquez pour l'ouvrir.",
          "Codex finished a response. Click to open it."
        )
      },
      () => this.options.navigateToThread(event.sourceId ?? null, event.threadId)
    );
  }

  /**
   * Shows a pending-approval notification and exposes native actions when supported.
   *
   * @param approval Approval request emitted by the backend.
   */
  private handleApprovalRequested(approval: OpenCodexApproval): void {
    if (!this.settings.desktopNotifications.approvalRequested) {
      return;
    }

    this.closeApprovalNotification(approval.id);

    const actions = this.buildApprovalActions(approval);
    const notificationOptions: NotificationConstructorOptions = {
      title: this.translate("Autorisation requise", "Approval required"),
      body: formatApprovalBody(approval)
    };

    if (this.platform === "darwin" && actions.length > 0) {
      notificationOptions.actions = actions.map((action) => ({
        type: "button" as const,
        text: action.label
      }));
    }

    const notification = this.createNotification(notificationOptions);

    if (notification === null) {
      return;
    }

    this.activeApprovalNotifications.set(approval.id, notification);
    notification.on("click", () => {
      this.navigateToApproval(approval);
    });
    notification.on("close", () => {
      if (this.activeApprovalNotifications.get(approval.id) === notification) {
        this.activeApprovalNotifications.delete(approval.id);
      }
    });

    if (this.platform === "darwin" && actions.length > 0) {
      notification.on("action", (_event, actionIndex) => {
        const action = actions[actionIndex];

        if (action !== undefined) {
          this.resolveApprovalFromNotification(approval, action.decision);
        }
      });
    }

    try {
      notification.show();
    } catch (error) {
      this.activeApprovalNotifications.delete(approval.id);
      this.options.logger(`Unable to show desktop approval notification: ${String(error)}`);
    }
  }

  /**
   * Creates the platform notification and reports unsupported hosts once.
   *
   * @param options Native notification options.
   * @returns Notification instance, or `null` when unavailable.
   */
  private createNotification(options: NotificationConstructorOptions): NativeNotification | null {
    if (!this.checkSupport()) {
      return null;
    }

    try {
      return (this.options.createNotification ?? ((notificationOptions) => (
        new Notification(notificationOptions)
      )))(options);
    } catch (error) {
      this.options.logger(`Unable to create desktop notification: ${String(error)}`);
      return null;
    }
  }

  /**
   * Checks whether Electron can display native notifications in this session.
   *
   * @returns Whether native notifications are available.
   */
  private checkSupport(): boolean {
    if (!this.hasCheckedSupport) {
      this.hasCheckedSupport = true;

      try {
        this.isSupported = this.options.isSupported?.() ?? Notification.isSupported();
      } catch (error) {
        this.options.logger(`Unable to check desktop notification support: ${String(error)}`);
        this.isSupported = false;
      }

      if (!this.isSupported) {
        this.options.logger("Desktop notifications are not supported by this system.");
      }
    }

    return this.isSupported;
  }

  /**
   * Stores a completion key while bounding memory growth for long-running sessions.
   *
   * @param key Turn notification key.
   * @returns Whether the key was newly added.
   */
  private rememberCompletedTurn(key: string): boolean {
    if (this.shownCompletedTurns.has(key)) {
      return false;
    }

    this.shownCompletedTurns.add(key);

    if (this.shownCompletedTurns.size > 1_000) {
      const oldestKey = this.shownCompletedTurns.values().next().value;

      if (typeof oldestKey === "string") {
        this.shownCompletedTurns.delete(oldestKey);
      }
    }

    return true;
  }

  /**
   * Closes the notification associated with a resolved approval.
   *
   * @param approvalId Resolved approval identifier.
   */
  private closeApprovalNotification(approvalId: string): void {
    const notification = this.activeApprovalNotifications.get(approvalId);

    if (notification === undefined) {
      return;
    }

    this.activeApprovalNotifications.delete(approvalId);
    notification.close();
  }

  /**
   * Focuses the app and routes an approval click to its owning chat.
   *
   * @param approval Approval associated with the notification.
   */
  private navigateToApproval(approval: OpenCodexApproval): void {
    this.options.focusWindow();

    if (approval.threadId !== undefined) {
      this.options.navigateToThread(approval.sourceId ?? null, approval.threadId);
    }
  }

  /**
   * Routes a native action through the same approval resolver as the UI dialog.
   *
   * @param approval Approval selected by the user.
   * @param decision Decision represented by the native action.
   */
  private resolveApprovalFromNotification(
    approval: OpenCodexApproval,
    decision: OpenCodexApprovalDecision
  ): void {
    this.navigateToApproval(approval);
    this.options.resolveApproval(approval.id, decision);
  }

  /**
   * Builds native action labels from decisions actually offered by Codex.
   *
   * @param approval Approval containing available decisions.
   * @returns At most three string-based native actions.
   */
  private buildApprovalActions(approval: OpenCodexApproval): ApprovalAction[] {
    const preferredDecisions: OpenCodexApprovalDecision[] = [
      "accept",
      "acceptForSession",
      "decline",
      "cancel"
    ];
    const actions: ApprovalAction[] = [];

    for (const decision of preferredDecisions) {
      if (!approval.choices.some((choice) => choice === decision)) {
        continue;
      }

      actions.push({ decision, label: this.translateDecision(decision) });
    }

    return actions.slice(0, 3);
  }

  /**
   * Shows a generic notification and wires its body click to navigation.
   *
   * @param options Notification title and body.
   * @param onClick Navigation callback.
   */
  private showNotification(
    options: NotificationConstructorOptions,
    onClick: () => void
  ): void {
    const notification = this.createNotification(options);

    if (notification === null) {
      return;
    }

    notification.on("click", () => {
      this.options.focusWindow();
      onClick();
    });

    try {
      notification.show();
    } catch (error) {
      this.options.logger(`Unable to show desktop notification: ${String(error)}`);
    }
  }

  /**
   * Translates a short notification label using the configured app language.
   *
   * @param french French label.
   * @param english English label.
   * @returns Localized label.
   */
  private translate(french: string, english: string): string {
    return this.settings.language === "fr" ? french : english;
  }

  /**
   * Translates one approval decision label.
   *
   * @param decision String decision to display.
   * @returns Localized action label.
   */
  private translateDecision(decision: OpenCodexApprovalDecision): string {
    if (decision === "accept") {
      return this.translate("Oui", "Yes");
    }

    if (decision === "acceptForSession") {
      return this.translate("Toujours accepter", "Always allow");
    }

    if (decision === "decline") {
      return this.translate("Non", "No");
    }

    return this.translate("Annuler", "Cancel");
  }
}

/**
 * Creates a stable key for one source/thread/turn completion.
 *
 * @param sourceId Source identifier.
 * @param threadId Thread identifier.
 * @param turnId Turn identifier.
 * @returns Completion key.
 */
function createTurnNotificationKey(
  sourceId: string | null,
  threadId: string,
  turnId: string
): string {
  return `${sourceId ?? "unknown"}:${threadId}:${turnId}`;
}

/**
 * Creates concise notification text without including the full approval body.
 *
 * @param approval Approval request.
 * @returns Notification body.
 */
function formatApprovalBody(approval: OpenCodexApproval): string {
  const subject = approval.command?.trim() || approval.title.trim() || "Codex";
  const reason = approval.reason?.trim();

  if (reason === undefined || reason.length === 0) {
    return subject;
  }

  return `${subject}\n${reason}`;
}
