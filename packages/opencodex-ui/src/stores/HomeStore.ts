/**
 * Holds the observable state for the Home tab.
 */
import { makeAutoObservable } from "mobx";

export type HomeSection = "projects" | "sources" | "settings";

/**
 * Stores Home navigation and project path form state.
 */
export class HomeStore {
  selectedSection: HomeSection = "projects";
  projectPathInput = "";
  selectedSourceId: string | null = null;
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

  /**
   * Updates the source used by Home project actions.
   *
   * @param sourceId Selected source identifier.
   *
   * @returns Nothing.
   */
  setSelectedSourceId(sourceId: string | null): void {
    this.selectedSourceId = sourceId;
  }
}
