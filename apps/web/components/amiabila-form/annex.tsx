export type AnnexPhoto = { role: "A" | "B"; src: string };

const PER_PAGE = 4;

/** Anexa cu pozele daunelor: câte o pagină A4 portret la 4 poze, separat pentru vehiculul A și B. */
export function Annex({ photos }: { photos: AnnexPhoto[] }) {
  const pages = (["A", "B"] as const).flatMap((role) => {
    const own = photos.filter((p) => p.role === role);
    return Array.from({ length: Math.ceil(own.length / PER_PAGE) }, (_, i) => ({
      role,
      n: i + 1,
      of: Math.ceil(own.length / PER_PAGE),
      items: own.slice(i * PER_PAGE, (i + 1) * PER_PAGE),
    }));
  });
  if (pages.length === 0) return null;
  return (
    <>
      {pages.map((page) => (
        <section key={`${page.role}-${page.n}`} className="af-annex mx-auto mt-4 max-w-[794px] bg-white shadow-md print:mt-0 print:shadow-none">
          <h2>
            Anexă: poze cu daunele vehiculului {page.role}
            {page.of > 1 ? ` (${page.n}/${page.of})` : ""}
          </h2>
          <div className="af-annex-grid">
            {page.items.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.src} src={p.src} alt={`Daune vehicul ${page.role}`} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
