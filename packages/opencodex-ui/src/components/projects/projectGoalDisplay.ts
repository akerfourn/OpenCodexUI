/** Parts used to render a project goal duration in a compact localized form. */
export type ProjectGoalDurationParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

/** Splits elapsed seconds into the units useful to the goal catalogue. */
export function readProjectGoalDuration(seconds: number): ProjectGoalDurationParts {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  return {
    days,
    hours,
    minutes,
    seconds: totalSeconds % 60
  };
}

/** Formats a goal duration while omitting units whose value is zero. */
export function formatProjectGoalDuration(
  seconds: number,
  translate: (key: string, options: { count: number }) => string
): string {
  const parts = readProjectGoalDuration(seconds);
  const values: Array<[string, number]> = [
    ["goals.duration.days", parts.days],
    ["goals.duration.hours", parts.hours],
    ["goals.duration.minutes", parts.minutes],
    ["goals.duration.seconds", parts.seconds]
  ];
  const labels = values
    .filter(([, value]) => value > 0)
    .map(([key, value]) => translate(key, { count: value }));

  return labels.length > 0 ? labels.join(" ") : translate("goals.duration.seconds", { count: 0 });
}

/** Returns whether a project goal status means its execution is finished. */
export function isFinishedProjectGoalStatus(status: string): boolean {
  return status === "blocked" || status === "usageLimited" ||
    status === "budgetLimited" || status === "complete" || status === "error";
}
