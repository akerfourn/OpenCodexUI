import { makeAutoObservable } from "mobx";

/**
 * Retains resizable layout state for one opened project view.
 */
export class ProjectViewLayoutStore {
  /** Width of the project thread sidebar in pixels. */
  workspaceSidebarWidth = 320;
  /** Width of the project contextual side panel in pixels. */
  sidePanelWidth = 360;
  /** Whether the project contextual side panel is collapsed. */
  isSidePanelCollapsed = false;

  /** Creates observable project layout state. */
  constructor() {
    makeAutoObservable(this);
  }

  /** Updates the project thread sidebar width. */
  setWorkspaceSidebarWidth(value: number): void {
    this.workspaceSidebarWidth = value;
  }

  /** Updates the project contextual side panel width. */
  setSidePanelWidth(value: number): void {
    this.sidePanelWidth = value;
  }

  /** Updates whether the contextual side panel is collapsed. */
  setSidePanelCollapsed(value: boolean): void {
    this.isSidePanelCollapsed = value;
  }
}
