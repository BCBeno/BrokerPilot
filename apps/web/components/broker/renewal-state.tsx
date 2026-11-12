import { ToneBadge } from "@/components/broker/status-pill";
import { roDate } from "@/lib/broker/renewals";
import type { RenewalItem } from "@/lib/broker/renewals-data";

/** Ce s-a făcut cu o reînnoire: reînnoită, contactat (cine, când), amânată până la o dată, sau încă nimic. */
export function StateText({ item }: { item: RenewalItem }) {
  const { state, brokerName } = item;
  const by = brokerName ? ` (${brokerName.split(" ")[0]})` : "";
  switch (state.kind) {
    case "renewed":
      return <ToneBadge tone="ok">Reînnoită</ToneBadge>;
    case "contacted":
      return (
        <span className="text-tone-ok-foreground">
          Contactat {shortDay(state.at)}
          {by}
        </span>
      );
    case "snoozed":
      return (
        <span className="text-muted-foreground">
          Reamintire pe {roDate(state.until)}
          {by}
        </span>
      );
    default:
      return state.reminderDue ? <ToneBadge tone="todo">Reamintire: azi</ToneBadge> : <span className="text-muted-foreground">Necontactat</span>;
  }
}

const shortDay = (at: string) =>
  new Date(at).toLocaleDateString("ro-RO", { timeZone: "Europe/Bucharest", day: "numeric", month: "short" });
