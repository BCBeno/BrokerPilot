import "./form.css";

/** Pagina 2/2 a formularului: instrucțiunile de utilizare și coperta „Constatare amiabilă europeană” (anexa nr. 7 la Norma ASF 20/2017). */
export function FormBack() {
  return (
    <article className="af-back" aria-label="Constatare amiabilă de accident, pagina 2 din 2: instrucțiuni">
      <div className="af-instr">
        <h2>
          IMPORTANT – VĂ RUGĂM, CITIȚI CU ATENȚIE!
          <br />
          Instrucțiuni de utilizare a formularului
        </h2>

        <h3>NOTE GENERALE</h3>
        <p className="caps">SCOPUL ACESTUI FORMULAR ESTE DE A LUA O DECLARAȚIE FIECĂRUI ȘOFER PRIVIND ÎMPREJURĂRILE ACCIDENTULUI.</p>
        <p>
          În cazul unui accident soldat cu vătămări de persoane, chemați Salvarea și anunțați Poliția – număr unic <strong>112</strong>!
        </p>
        <p>
          Prezentul formular corespunde modelului elaborat de Insurance Europe. Astfel, dacă unul dintre conducătorii auto implicați în
          accidentul rutier posedă un formular într-o altă limbă, nu contează pe care dintre ele îl completați,{" "}
          <u>dar trebuie să vă asigurați că veți păstra fie copie, fie originalul formularului completat pentru a-l trimite asigurătorului.</u>
        </p>

        <h4>INSTRUCȚIUNI</h4>
        <h4>LA LOCUL ACCIDENTULUI</h4>
        <ol>
          <li>Luați datele tuturor martorilor, înainte ca aceștia să plece – completați pct. 5.</li>
          <li>
            Preferabil utilizând un pix, completați în totalitate fie partea galbenă fie cea albastră a constatării amiabile (este nevoie să
            completați datele conform poliței de asigurare, cărții verzi și permisului de conducere).
          </li>
          <li>
            Atunci când considerați că ați completat corect formularul semnați-l și luați un exemplar semnat și de către celălalt șofer
            (15).
          </li>
          <li>
            Nu uitați să:
            <ol>
              <li>Marcați clar punctul inițial de impact (pct. 10).</li>
              <li>
                Marcați cu „X” în partea dumneavoastră fiecare căsuță corespunzătoare situației - pct. 12 și menționați numărul total de
                căsuțe marcate.
              </li>
              <li>Desenați o schiță a accidentului menționând toate informațiile solicitate – pct. 13.</li>
            </ol>
          </li>
        </ol>

        <h3>SUB NICIO FORMĂ NU MODIFICAȚI ÎNSEMNĂRILE DIN FORMULAR DUPĂ COMPLETAREA ȘI SEMNAREA ACESTUIA</h3>

        <h3>CÂND VĂ ÎNTOARCEȚI ACASĂ</h3>
        <p>Trimiteți imediat formularul Constatare amiabilă către asigurătorul dumneavoastră.</p>

        <h4>NOTĂ SPECIALĂ</h4>
        <p>
          Acest formular poate fi utilizat și în cazul în care nu a fost implicat un alt vehicul, la asigurările CASCO, spre exemplu pentru:
          daune numai la propriul vehicul, furt, incendiu etc., în limitele legislației aplicabile.
        </p>
        <p className="caps">PĂSTRAȚI ACEST FORMULAR (ȘI UN PIX) ÎN MAȘINĂ!</p>
        <p className="fine">
          Drept de autor 2001 © Insurance Europe aisbl. Toate drepturile rezervate. Acest formular poate fi reprodus numai cu acordul
          prealabil obținut în scris de la Insurance Europe aisbl. Orice utilizare, reproducere sau modificare neautorizată reprezintă
          încălcarea drepturilor de autor.
        </p>
      </div>

      <div className="af-cover">
        <div className="oval">
          CONSTATARE AMIABILĂ
          <br />
          EUROPEANĂ
        </div>
        <ul>
          <li>Nu fiți nervos!</li>
          <li>Fiți politicos!</li>
          <li>Păstrați-vă calmul!</li>
        </ul>
        <div className="arrow">
          <svg width="90" height="70" viewBox="0 0 90 70" aria-hidden>
            <polygon points="0,35 38,2 38,22 90,22 90,48 38,48 38,68" fill="#fff" />
          </svg>
          <span>
            Urmăriți instrucțiunile
            <br />
            de completare!
          </span>
        </div>
      </div>
    </article>
  );
}
