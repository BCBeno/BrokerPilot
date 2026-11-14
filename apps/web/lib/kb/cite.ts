/** Eticheta unei citări, la fel ca în WF04 („Parse answer”): [titlu, pag. N]. Separat, ca UI-ul să nu aducă redactarea în bundle. */
export const citeLabel = (s: { title: string; page?: number | null }) => `[${s.title}${s.page ? `, pag. ${s.page}` : ""}]`;
