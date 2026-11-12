import type { ReactNode } from "react";
import { FORM_CIRCUMSTANCES, type ImpactZone } from "@/lib/amiabila/content";
import { countChecked, type FormData, type Party, type YesNo } from "@/lib/amiabila/form";
import { BikeArt, CarImpact, TruckArt } from "./impact-art";
import { SketchView } from "./sketch-view";
import "./form.css";

type Who = "a" | "b";

function Num({ n, who }: { n: number; who?: Who }) {
  return <span className={`af-n ${who ?? ""}`}>{n}.</span>;
}

function Check({ on }: { on: boolean }) {
  return (
    <span className="af-cb" role="checkbox" aria-checked={on}>
      {on ? "X" : ""}
    </span>
  );
}

function YesNoPair({ value, order = "nu-da" }: { value: YesNo; order?: "nu-da" | "da-nu" }) {
  const nu = (
    <span className="af-yn">
      nu <Check on={value === false} />
    </span>
  );
  const da = (
    <span className="af-yn">
      da <Check on={value === true} />
    </span>
  );
  return (
    <span className="af-ynp">
      {order === "nu-da" ? nu : da}
      {order === "nu-da" ? da : nu}
    </span>
  );
}

function Line({ label, value, grow = true }: { label: string; value: string; grow?: boolean }) {
  return (
    <div className="af-line" style={grow ? undefined : { flex: "none" }}>
      <span className="af-l">{label}</span>
      <span className="af-v">{value}</span>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="af-row">{children}</div>;
}

function Box({ n, who, title, children, className }: { n?: number; who?: Who; title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`af-box ${className ?? ""}`}>
      {n ? <Num n={n} who={who} /> : null}
      {title ? <h3 className="af-bt">{title}</h3> : null}
      {children}
    </section>
  );
}

function Policyholder({ p, who }: { p: Party; who: Who }) {
  const h = p.holder;
  return (
    <Box n={6} who={who} title={<>Asigurat/Deținător poliță <small>(vezi documentul de asigurare)</small></>}>
      <Line label="Nume:" value={h.surname} />
      <Line label="Prenume:" value={h.firstName} />
      <Line label="Adresă:" value={h.address} />
      <Row>
        <Line label="Cod poștal:" value={h.postalCode} />
        <Line label="Țara:" value={h.country} />
      </Row>
      <Line label="Tel. sau e-mail:" value={h.contact} />
    </Box>
  );
}

function VehicleBox({ p, who }: { p: Party; who: Who }) {
  const v = p.vehicle;
  return (
    <Box n={7} who={who} title="Vehicul" className="af-vehicle">
      <div className="af-split">
        <div>
          <div className="af-sub">CU MOTOR</div>
          <Line label="Marcă, tip" value={v.makeType} />
          <Line label="Nr. înmatriculare/înregistrare" value={v.plate} />
          <Line label="Țara în care este înmatriculat/înregistrat" value={v.country} />
        </div>
        <div>
          <div className="af-sub">REMORCĂ</div>
          <Line label="Nr. înmatriculare/înregistrare" value={v.trailerPlate} />
          <Line label="Țara în care este înmatriculată/înregistrată" value={v.trailerCountry} />
        </div>
      </div>
    </Box>
  );
}

function InsuranceBox({ p, who }: { p: Party; who: Who }) {
  const i = p.insurance;
  return (
    <Box n={8} who={who} title={<>Societate de asigurare <small>(vezi documentul de asigurare)</small></>}>
      <Line label="DENUMIRE:" value={i.company} />
      <Line label="Polița nr.:" value={i.policyNo} />
      <Line label="Carte Verde nr.:" value={i.greenCardNo} />
      <div className="af-cap">Poliță de asigurare sau Carte Verde cu valabilitate</div>
      <Row>
        <Line label="de la:" value={i.validFrom} />
        <Line label="la:" value={i.validTo} />
      </Row>
      <div className="af-cap">Sucursala (sau agenția, sau brokerul):</div>
      <Line label="DENUMIRE:" value={i.branchName} />
      <Line label="Adresă:" value={i.branchAddress} />
      <Line label="Țara:" value={i.branchCountry} />
      <Line label="Tel. sau e-mail:" value={i.branchContact} />
      <div className="af-casco">
        <span>Daunele materiale ale vehiculului sunt acoperite printr-o poliță CASCO?</span>
        <YesNoPair value={i.casco} />
      </div>
    </Box>
  );
}

function DriverBox({ p, who }: { p: Party; who: Who }) {
  const d = p.driver;
  return (
    <Box n={9} who={who} title={<>Conducător vehicul <small>(vezi permis de conducere)</small></>}>
      <Line label="NUME:" value={d.surname} />
      <Line label="Prenume:" value={d.firstName} />
      <Line label="Data nașterii:" value={d.birthDate} />
      <Line label="Adresă:" value={d.address} />
      <Line label="Țara:" value={d.country} />
      <Line label="Tel. sau e-mail:" value={d.contact} />
      <Line label="Permis de conducere nr.:" value={d.licenseNo} />
      <Line label="Categoria (A, B, ...):" value={d.category} />
      <Line label="Valabil până la:" value={d.licenseValidTo} />
    </Box>
  );
}

function ImpactBox({ p, who, letter }: { p: Party; who: Who; letter: "A" | "B" }) {
  const zone: ImpactZone | null = p.impactPoint;
  return (
    <Box n={10} who={who} title={<>Indicați punctul inițial de impact pentru vehiculul {letter} printr-o săgeată →</>} className="af-impact">
      <div className="af-art">
        <BikeArt />
        <CarImpact zone={zone} />
        <TruckArt />
      </div>
    </Box>
  );
}

function DamageBox({ p, who, letter }: { p: Party; who: Who; letter: "A" | "B" }) {
  return (
    <Box n={11} who={who} title={<>Pagube vizibile la vehiculul {letter}:</>} className="af-damage">
      <p className="af-free">{p.visibleDamage}</p>
    </Box>
  );
}

function ObservationsBox({ p, who }: { p: Party; who: Who }) {
  return (
    <Box n={14} who={who} title="Observații:" className="af-obs">
      <p className="af-free">{p.observations}</p>
    </Box>
  );
}

function Circumstances({ form }: { form: FormData }) {
  const a = new Set(form.a.circumstances);
  const b = new Set(form.b.circumstances);
  return (
    <div className="af-circ">
      <div className="af-circ-lead">
        <span className="af-ab">A</span>
        <p>
          Marcați cu X fiecare căsuță utilă pentru explicarea desenului
          <small>* la pct. 1 și 2 tăiați situația care nu corespunde</small>
        </p>
        <span className="af-ab">B</span>
      </div>
      <div className="af-circ-list">
        {FORM_CIRCUMSTANCES.map((label, i) => {
          const n = i + 1;
          return (
            <div key={n} className="af-circ-row">
              <Check on={a.has(n)} />
              <span className="af-cn">{n}</span>
              <span className="af-ct">{n <= 2 ? <>* {label}</> : label}</span>
              <span className="af-cn">{n}</span>
              <Check on={b.has(n)} />
            </div>
          );
        })}
      </div>
      <div className="af-count">
        <span className="af-arrow">←</span>
        <span className="af-cb wide" aria-label="Căsuțe marcate la A">
          {form.a.circumstances.length ? countChecked(form.a) : ""}
        </span>
        <span className="af-count-t">specificați numărul de căsuțe marcate cu X</span>
        <span className="af-cb wide" aria-label="Căsuțe marcate la B">
          {form.b.circumstances.length ? countChecked(form.b) : ""}
        </span>
        <span className="af-arrow">→</span>
      </div>
      <p className="af-legal">
        <strong>Trebuie semnat de ambii conducători de vehicule.</strong> Nu constituie o recunoaștere a responsabilității, ci un cumul de
        elemente și fapte care vor ajuta în soluționarea rapidă a cererii de despăgubire.
      </p>
      {/* Ca pe formularul oficial, titlul casetei 13 stă în coloana de mijloc, deasupra caroiajului. */}
      <div className="af-sketch-title">
        <div className="af-sketch-head">
          <span className="af-n">13.</span>
          <strong>Schița accidentului în momentul producerii impactului</strong>
          <span className="af-n">13.</span>
        </div>
        <p className="af-sketch-note">
          Indicați: 1. poziția drumului 2. direcția de deplasare a vehiculelor A,B prin săgeți 3. poziția vehiculelor în momentul impactului
          4. semnele de circulație 5. numele străzilor sau drumurilor
        </p>
      </div>
    </div>
  );
}

export function FormSheet({ form }: { form: FormData }) {
  return (
    <article className="af-sheet" aria-label="Constatare amiabilă de accident, pagina 1 din 2">
      {form.specimen ? <div className="af-wm" aria-hidden>SPECIMEN</div> : null}

      <header className="af-head">
        <h1>CONSTATARE AMIABILĂ DE ACCIDENT</h1>
        <span>Pagina 1/2</span>
      </header>

      <div className="af-top1">
        <Box n={1} title="Data accidentului" className="af-date">
          <div className="af-v af-big">{form.date}</div>
        </Box>
        <Box title="Ora" className="af-time">
          <div className="af-v af-big">{form.time}</div>
        </Box>
        <section className="af-box af-place">
          <Num n={2} />
          <div className="af-place-l">
            <h3 className="af-bt">Localizare</h3>
            <Line label="Țara:" value={form.country} />
          </div>
          <div className="af-place-r">
            <Line label="Locul:" value={form.place} />
          </div>
        </section>
        <Box n={3} className="af-injured">
          <small className="af-tiny">Vătămări corporale, chiar dacă sunt ușoare</small>
          <YesNoPair value={form.injured} order="da-nu" />
        </Box>
      </div>

      <div className="af-top2">
        <Box n={4} title="Pagube materiale" className="af-dmg">
          <div className="af-dmg-grid">
            <div>
              <small>la alte vehicule decât A și B</small>
              <YesNoPair value={form.otherVehiclesDamaged} />
            </div>
            <div>
              <small>la alte obiecte, în afară de vehicule</small>
              <YesNoPair value={form.otherObjectsDamaged} />
            </div>
          </div>
        </Box>
        <Box n={5} title="Martori : nume, adrese, tel.:" className="af-wit">
          <p className="af-free">{form.witnesses}</p>
        </Box>
      </div>

      <div className="af-main">
        <div className="af-col a">
          <div className="af-colhead">VEHICUL A</div>
          <Policyholder p={form.a} who="a" />
          <VehicleBox p={form.a} who="a" />
          <InsuranceBox p={form.a} who="a" />
          <DriverBox p={form.a} who="a" />
        </div>

        <div className="af-center">
          <div className="af-centerhead">
            <span className="af-n gen">12.</span> ÎMPREJURĂRI
          </div>
          <Circumstances form={form} />
        </div>

        <div className="af-col b">
          <div className="af-colhead">VEHICUL B</div>
          <Policyholder p={form.b} who="b" />
          <VehicleBox p={form.b} who="b" />
          <InsuranceBox p={form.b} who="b" />
          <DriverBox p={form.b} who="b" />
        </div>
      </div>

      <div className="af-lower">
        <div className="af-side a">
          <ImpactBox p={form.a} who="a" letter="A" />
          <DamageBox p={form.a} who="a" letter="A" />
        </div>
        <section className="af-sketch">
          <SketchView sketch={form.sketch} />
        </section>
        <div className="af-side b">
          <ImpactBox p={form.b} who="b" letter="B" />
          <DamageBox p={form.b} who="b" letter="B" />
        </div>
      </div>

      <div className="af-foot">
        <div className="af-col a">
          <ObservationsBox p={form.a} who="a" />
        </div>
        <div className="af-sign">
          <div className="af-sign-head">
            <span className="af-n a">15.</span>
            <strong>Semnăturile conducătorilor de vehicule</strong>
            <span className="af-n b">15.</span>
          </div>
          <div className="af-sign-pad">
            {/* Semnăturile sunt data URL-uri generate pe client; next/image nu aduce nimic aici. */}
            {/* eslint-disable @next/next/no-img-element */}
            <div className="af-sign-cell">{form.a.signature ? <img src={form.a.signature} alt="Semnătura conducătorului A" /> : null}</div>
            <div className="af-sign-cell">{form.b.signature ? <img src={form.b.signature} alt="Semnătura conducătorului B" /> : null}</div>
            {/* eslint-enable @next/next/no-img-element */}
          </div>
          <div className="af-letters">
            <span>A</span>
            <span>B</span>
          </div>
        </div>
        <div className="af-col b">
          <ObservationsBox p={form.b} who="b" />
        </div>
      </div>

      <div className="af-gdpr">
        Protecția datelor cu caracter personal este dată de Legea nr. 677/2001, cu modificările și completările ulterioare
      </div>
      <footer className="af-copy">Drept de autor 2001 © Insurance Europe aisbl.</footer>
    </article>
  );
}
