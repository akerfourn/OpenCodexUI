import { action, computed, makeObservable, observable } from "mobx";

import { AppLifecycleStore, type AppLifecycleRequestPort } from "./AppLifecycleStore";

/**
 * Stores onboarding visibility state and completion persistence.
 */
export class AppOnboardingStore extends AppLifecycleStore {
  /** Whether onboarding should be shown even after it was completed. */
  forceOnboarding = false;
  /** Whether forced onboarding was dismissed during this application session. */
  forcedOnboardingDismissed = false;

  /**
   * Creates the onboarding store.
   *
   * @param root Backend request port used to persist onboarding completion.
   */
  constructor(root: AppLifecycleRequestPort) {
    super(root);
    makeObservable<AppOnboardingStore>(this, {
      forceOnboarding: observable,
      forcedOnboardingDismissed: observable,
      shouldShowOnboarding: computed,
      setForceOnboarding: action,
      completeOnboarding: action
    });
  }

  /**
   * Returns whether the startup onboarding should replace the main shell.
   *
   * @returns Whether onboarding is currently visible.
   */
  get shouldShowOnboarding(): boolean {
    if (this.isBootstrapping) {
      return false;
    }

    if (!this.settingsStore.settings.onboardingCompleted) {
      return true;
    }

    return this.forceOnboarding && !this.forcedOnboardingDismissed;
  }

  /**
   * Forces onboarding display for the current development session.
   *
   * @param forceOnboarding Whether onboarding should appear at startup.
   * @returns Nothing.
   */
  setForceOnboarding(forceOnboarding: boolean): void {
    this.forceOnboarding = forceOnboarding;
  }

  /**
   * Marks onboarding as completed and hides forced onboarding for this session.
   *
   * @returns Nothing.
   */
  completeOnboarding(): void {
    this.forcedOnboardingDismissed = true;
    this.settingsStore.completeOnboarding();
  }
}
