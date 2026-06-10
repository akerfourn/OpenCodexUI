/**
 * Renders the project main workspace with a resizable right-side panel.
 */
import DragIndicatorOutlinedIcon from "@mui/icons-material/DragIndicatorOutlined";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";

type ProjectWorkspaceLayoutProps = {
  defaultPanelWidth: number;
  isSidePanelCollapsed: boolean;
  minPanelWidth?: number;
  maxPanelWidth?: number;
  mainMinWidth?: number;
  mainPanel: ReactNode;
  sidePanel: ReactNode;
};

/**
 * Renders a two-pane project workspace with a right-side draggable separator.
 *
 * @param props Component props.
 *
 * @returns Rendered workspace layout.
 */
export function ProjectWorkspaceLayout({
  defaultPanelWidth,
  isSidePanelCollapsed,
  minPanelWidth = 280,
  maxPanelWidth = 560,
  mainMinWidth = 520,
  mainPanel,
  sidePanel
}: ProjectWorkspaceLayoutProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [panelWidth, setPanelWidth] = useState(defaultPanelWidth);
  const [isResizing, setIsResizing] = useState(false);
  const shellStyle = {
    "--project-side-panel-width": `${panelWidth}px`
  } as CSSProperties;

  useEffect(() => {
    if (!isResizing) {
      return undefined;
    }

    function handlePointerMove(event: PointerEvent): void {
      setPanelWidth(readBoundedPanelWidth(
        rootRef.current,
        event.clientX,
        minPanelWidth,
        maxPanelWidth,
        mainMinWidth
      ));
    }

    function handlePointerUp(): void {
      setIsResizing(false);
    }

    document.body.classList.add("is-resizing-project-panel");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      document.body.classList.remove("is-resizing-project-panel");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing, mainMinWidth, maxPanelWidth, minPanelWidth]);

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    setPanelWidth(readBoundedPanelWidth(
      rootRef.current,
      event.clientX,
      minPanelWidth,
      maxPanelWidth,
      mainMinWidth
    ));
    setIsResizing(true);
  }

  const className = isSidePanelCollapsed
    ? "project-workspace-main is-project-side-panel-collapsed"
    : "project-workspace-main";

  return (
    <section ref={rootRef} className={className} style={shellStyle}>
      {mainPanel}
      <div
        className="project-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        aria-hidden={isSidePanelCollapsed}
        onPointerDown={handleResizeStart}
      >
        <DragIndicatorOutlinedIcon fontSize="small" />
      </div>
      {sidePanel}
    </section>
  );
}

/**
 * Returns a right panel width constrained to usable layout bounds.
 *
 * @param root Workspace root element.
 * @param pointerX Horizontal pointer position.
 * @param minWidth Minimum side panel width.
 * @param maxWidth Maximum side panel width.
 * @param mainMinWidth Minimum width preserved for the main pane.
 *
 * @returns Bounded side panel width.
 */
function readBoundedPanelWidth(
  root: HTMLElement | null,
  pointerX: number,
  minWidth: number,
  maxWidth: number,
  mainMinWidth: number
): number {
  const bounds = root?.getBoundingClientRect();
  const availableWidth = bounds?.width ?? document.documentElement.clientWidth;
  const rightEdge = bounds?.right ?? document.documentElement.clientWidth;
  const dynamicMaxWidth = Math.max(minWidth, availableWidth - mainMinWidth);
  const resolvedMaxWidth = Math.min(maxWidth, dynamicMaxWidth);
  const requestedWidth = rightEdge - pointerX;

  return Math.min(Math.max(requestedWidth, minWidth), resolvedMaxWidth);
}
