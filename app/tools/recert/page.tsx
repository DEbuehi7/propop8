import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Oswald, JetBrains_Mono } from "next/font/google";
import hero from "./hero.jpg";
import s from "./recert.module.css";

const display = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--f-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "Recert Flow Engine · PropOps8",
  description:
    "Annual recertification form preparation for LIHTC / HOTMA: enter household data, classify income, calculate, and route the CTCAC form set.",
};

/* ── BUILD STATUS ─────────────────────────────────────────────
   live    = working in the engine today
   verify  = partly built / not yet tested end-to-end
   roadmap = shown in the concept art, not built
   Flip a step to "live" only after you've run it in the engine. */
type Status = "live" | "verify" | "roadmap";
const STEPS: { title: string; desc: string; status: Status }[] = [
  { title: "Enter data", desc: "Type or import household data", status: "live" },
  { title: "Validate + classify", desc: "Income types mapped to TIC columns", status: "live" },
  { title: "Calculate", desc: "Annualize income, assets, 140% rule", status: "live" },
  { title: "Route forms", desc: "Rules engine selects the CTCAC HOTMA set", status: "live" },
  { title: "Detect gaps", desc: "Missing pages + required forms", status: "verify" },
  { title: "Manager review", desc: "Verify + resolve exceptions", status: "verify" },
  { title: "Packet + audit log", desc: "Assemble packet, record every event", status: "verify" },
  { title: "OCR upload", desc: "Read + sort scanned documents", status: "roadmap" },
  { title: "Third-party verify", desc: "Income, assets, external data", status: "roadmap" },
  { title: "E-sign", desc: "Signatures + final approval", status: "roadmap" },
];

const LABEL: Record<Status, string> = { live: "Live", verify: "Testing", roadmap: "Roadmap" };

export default function RecertLanding() {
  const liveCount = STEPS.filter((x) => x.status === "live").length;
  return (
    <main className={`${s.page} ${display.variable} ${mono.variable}`}>
      <div className={s.wrap}>
        <nav className={s.crumb}>
          <Link href="/">PropOps8</Link> <span>/</span> <span>Tools</span> <span>/</span> <span>Recert</span>
        </nav>

        <section className={s.hero}>
          <div className={s.heroText}>
            <p className={s.kicker}>PropOps8 // Compliance automation // CTCAC HOTMA form set</p>
            <h1 className={s.title}>
              Recert <em>Flow Engine</em>
            </h1>
            <p className={s.lede}>
              Annual recertification, prepared in one pass. Enter the household, let the rules engine classify income,
              run the math and route the right forms, then review before anything is signed.
            </p>
            <div className={s.ctas}>
              <Link className={s.primary} href="/tools/recert/engine">
                Launch the engine <span aria-hidden>→</span>
              </Link>
              <Link className={s.secondary} href="/audit">
                Book an operations audit
              </Link>
            </div>
            <p className={s.meta}>
              {liveCount} of {STEPS.length} stages live · Synthetic sample data included for demo
            </p>
          </div>
          <figure className={s.heroFig}>
            <div className={s.glow} aria-hidden />
            <Image src={hero} alt="Recert Flow Engine concept illustration" priority placeholder="blur" className={s.heroImg} />
            <figcaption>Concept illustration. Figures shown are illustrative; build status is listed below.</figcaption>
          </figure>
        </section>

        <section aria-labelledby="flow" className={s.flowSec}>
          <div className={s.secHead}>
            <h2 id="flow" className={s.h2}>The flow</h2>
            <ul className={s.legend}>
              <li><i className={s.dLive} />Live</li>
              <li><i className={s.dVerify} />Testing</li>
              <li><i className={s.dRoad} />Roadmap</li>
            </ul>
          </div>
          <ol className={s.flow}>
            {STEPS.map((step, i) => (
              <li key={step.title} className={`${s.step} ${s[step.status]}`} style={{ ["--i" as string]: i }}>
                <span className={s.num}>{String(i + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                <span className={s.chip}>{LABEL[step.status]}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.stack}>
          {[
            ["Data intake", "Typed or imported"],
            ["Rules engine", "Versioned form logic"],
            ["HOTMA calculator", "Income · assets · 140%"],
            ["Packet readiness", "What's done, what's missing"],
          ].map(([t, d]) => (
            <div key={t} className={s.stackCard}>
              <span className={s.pulse} aria-hidden />
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </section>

        <footer className={s.foot}>
          <p>
            PropOps8 prepares data and routes forms; it does not determine eligibility. The owner or agent remains
            responsible for verifying income and certifying the household under Section 42 and the regulatory
            agreement. Not legal or tax advice.
          </p>
          <p className={s.brand}>
            <strong>PropOps8</strong> | Properties · People · Compliance
          </p>
        </footer>
      </div>
    </main>
  );
}
