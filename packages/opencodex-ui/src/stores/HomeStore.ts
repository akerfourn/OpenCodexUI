/**
 * Holds the observable state for the Home tab.
 */
import { makeAutoObservable } from "mobx";

export type HomeSection = "projects" | "settings";

/**
 * Stores Home navigation and project path form state.
 */
export class HomeStore {
  selectedSection: HomeSection = "projects";
  projectPathInput = "";
  isOpeningProject = false;

  /**
   * Creates the Home store.
   */
  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Selects a Home section.
   *
   * @param section Section to show.
   *
   * @returns Nothing.
   */
  selectSection(section: HomeSection): void {
    this.selectedSection = section;
  }

  /**
   * Updates the manual project path input.
   *
   * @param value Input value.
   *
   * @returns Nothing.
   */
  setProjectPathInput(value: string): void {
    this.projectPathInput = value;
  }
}
