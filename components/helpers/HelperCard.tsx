"use client";

// One helper clip: the recording, its title and the steps it shows. The step
// being shown lights up while the clip plays, so the callouts are page text
// (selectable, translatable, read by screen readers) rather than burned into
// the video. Nothing plays until the viewer presses play.

import { useId, useState } from "react";
import type { Caption, HelperKind } from "@/lib/helpers/registry";
import s from "./helpers.module.css";

interface Props {
  title: string;
  kind: HelperKind;
  exampleData: boolean;
  files: { video: string; poster: string; captions: string };
  size: { width: number; height: number };
  steps: readonly Caption[];
}

export default function HelperCard({ title, kind, exampleData, files, size, steps }: Props) {
  const [active, setActive] = useState(-1);
  const stepsId = useId();

  return (
    <figure className={s.card}>
      <div className={s.frame}>
        <video
          className={s.video}
          controls
          loop
          playsInline
          preload="none"
          poster={files.poster}
          width={size.width}
          height={size.height}
          aria-describedby={stepsId}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setActive(steps.findIndex((c) => t >= c.from && t < c.to));
          }}
        >
          <source src={files.video} type="video/mp4" />
          <track kind="captions" src={files.captions} srcLang="en" label="English" />
        </video>
      </div>
      <figcaption className={s.body}>
        <h3 className={s.title}>{title}</h3>
        <p className={kind === "concept" ? `${s.chip} ${s.concept}` : s.chip}>
          {kind === "concept" ? "Concept" : exampleData ? "Example data" : "Live tool"}
        </p>
        <ol id={stepsId} className={s.steps}>
          {steps.map((c, i) => (
            <li key={c.from} className={i === active ? s.on : undefined} aria-current={i === active ? "step" : undefined}>
              {c.text}
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
