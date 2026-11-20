/** Expected image absence stays local to its preview rather than entering the application journal. */
export class ImageUnavailableError extends Error {
  /** Retains diagnostic detail for callers without depending on localized filesystem messages. */
  constructor(message: string) {
    super(message);
    this.name = "ImageUnavailableError";
  }
}
