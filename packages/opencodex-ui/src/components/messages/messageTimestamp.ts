/**
 * Formats a message timestamp for the current locale and relative day.
 *
 * @param value Serialized timestamp, or `null`.
 * @param translate Translation function.
 * @returns Human-readable timestamp, or an empty string for invalid values.
 */
export function formatMessageTimestamp(
  value: string | null,
  translate: (key: string, values?: Record<string, string>) => string
): string {
  if (value === null) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);

  if (isSameDay(date, new Date())) {
    return translate("message.todayAt", { time });
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, yesterday)) {
    return translate("message.yesterdayAt", { time });
  }

  const day = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);

  return `${day} - ${time}`;
}

/** Checks whether two dates belong to the same local calendar day. */
function isSameDay(firstDate: Date, secondDate: Date): boolean {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}
