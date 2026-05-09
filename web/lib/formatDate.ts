// Prose dates: "Oct 4, 2021". Tabular dates stay ISO; callers handle that.

const PROSE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return iso;
  return PROSE.format(d);
}
