/**
 * Renders a two-pane layout with a draggable sidebar separator.
 */
import DragIndicatorOutlinedIcon from "@mui/icons-material/DragIndicatorOutlined";
import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

type ResizableSidebarLayoutProps = {
  className: string;
  defaultSidebarWidth: number;
  minSidebarWidth?: number;
  maxSidebarWidth?: number;
  mainMinWidth?: number;
  sidebar: ReactNode;
  children: ReactNode;
};

/**
 * Renders a resizable sidebar layout.
 *
 * @param props Component props.
 *
 * @returns Rendered layout.
 */
export function ResizableSidebarLayout({
  className,
  defaultSidebarWidth,
  minSidebarWidth = 240,
  maxSidebarWidth = 560,
  mainMinWidth = 520,
  sidebar,
  children
}: ResizableSidebarLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(defaultSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const shellStyle = {
    "--sidebar-width": `${sidebarWidth}px`
  } as CSSProperties;

  useEffect(() => {
    if (!isResizing) {
      return undefined;
    }

    function handlePointerMove(event: PointerEvent): void {
      setSidebarWidth(readBoundedSidebarWidth(
        event.clientX,
        minSidebarWidth,
        maxSidebarWidth,
        mainMinWidth
      ));
    }

    function handlePointerUp(): void {
      setIsResizing(false);
    }

    document.body.classList.add("is-resizing-sidebar");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      document.body.classList.remove("is-resizing-sidebar");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing, mainMinWidth, maxSidebarWidth, minSidebarWidth]);

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    setSidebarWidth(readBoundedSidebarWidth(
      event.clientX,
      minSidebarWidth,
      maxSidebarWidth,
      mainMinWidth
    ));
    setIsResizing(true);
  }

  return (
    <section className={`resizable-sidebar-shell ${className}`} style={shellStyle}>
      {sidebar}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={handleResizeStart}
      >
        <DragIndicatorOutlinedIcon fontSize="small" />
      </div>
      {children}
    </section>
  );
}

/**
 * Returns a sidebar width constrained to usable layout bounds.
 *
 * @param pointerX Horizontal pointer position.
 * @param minWidth Minimum sidebar width.
 * @param maxWidth Maximum sidebar width.
 * @param mainMinWidth Minimum width preserved for the main pane.
 *
 * @returns Bounded sidebar width.
 */
function readBoundedSidebarWidth(
  pointerX: number,
  minWidth: number,
  maxWidth: number,
  mainMinWidth: number
): number {
  const availableWidth = document.documentElement.clientWidth;
  const dynamicMaxWidth = Math.max(minWidth, availableWidth - mainMinWidth);
  const resolvedMaxWidth = Math.min(maxWidth, dynamicMaxWidth);

  return Math.min(Math.max(pointerX, minWidth), resolvedMaxWidth);
}
