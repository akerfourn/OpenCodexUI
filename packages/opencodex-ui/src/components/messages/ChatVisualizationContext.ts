import { createContext } from "react";

/** Supplies the current conversation's file reader, or null to display links instead. */
export const ChatVisualizationContext = createContext<((path: string) => Promise<string | null>) | null>(null);
