const TZ = "Europe/Bucharest";

export type TimelineItem = { at: string; label: string; detail?: string | null; href?: string };
export type TimelineDay = { day: string; items: (TimelineItem & { time: string })[] };

/** Împarte un istoric pe zile (ora României), cele mai noi primele. */
export function groupByDay(items: TimelineItem[]): TimelineDay[] {
  const sorted = [...items].sort((a, b) => b.at.localeCompare(a.at));
  const days: TimelineDay[] = [];
  for (const item of sorted) {
    const d = new Date(item.at);
    const day = d.toLocaleDateString("ro-RO", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const time = d.toLocaleTimeString("ro-RO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    const last = days.at(-1);
    if (last?.day === day) last.items.push({ ...item, time });
    else days.push({ day, items: [{ ...item, time }] });
  }
  return days;
}
