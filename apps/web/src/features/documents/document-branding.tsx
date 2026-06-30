"use client";

import Image from "next/image";

type DocumentLogoProps = {
  companyName: string;
  logoUrl?: string | null;
};

type DocumentMetaItem = {
  label: string;
  value: string;
};

const carbonLogo = "/brand/carbon-flow-logo-on-light-v2.png";

export function DocumentPrimaryLogo({
  companyName,
  logoUrl
}: DocumentLogoProps) {
  const src = logoUrl || carbonLogo;
  const alt = logoUrl ? `Logo de ${companyName}` : "Carbon Flow";

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-[#dfe5e3] bg-white p-2 shadow-sm">
      <img alt={alt} className="h-full w-full object-contain" src={src} />
    </div>
  );
}

export function DocumentWatermark({ text }: { text: string }) {
  return (
    <div
      aria-hidden="true"
      className="document-watermark pointer-events-none absolute inset-x-0 top-[42%] z-0 flex justify-center overflow-hidden text-center text-[5rem] font-semibold uppercase leading-none tracking-normal text-[#101314]/[0.035] sm:text-[7rem]"
    >
      <span className="-rotate-12 whitespace-nowrap">{text}</span>
    </div>
  );
}

export function DocumentMetaStrip({ items }: { items: DocumentMetaItem[] }) {
  return (
    <section className="document-meta-strip mt-8 grid gap-3 rounded-md border border-[#dfe5e3] bg-[#f7faf8] p-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div className="min-w-0" key={`${item.label}-${item.value}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6a7672]">
            {item.label}
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-[#101314]">
            {item.value}
          </p>
        </div>
      ))}
    </section>
  );
}

export function DocumentTermsList({
  items,
  title
}: {
  items: string[];
  title: string;
}) {
  return (
    <article className="rounded-md border border-[#dfe5e3] bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4d5a56]">
        {title}
      </h2>
      <ul className="mt-4 grid gap-3 text-sm leading-6 text-[#53615d]">
        {items.map((item) => (
          <li className="flex gap-2" key={item}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#17633f]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function CarbonDocumentSignature() {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-[#dfe5e3] bg-[#f7faf8] px-3 py-2 text-xs font-medium text-[#53615d]">
      <Image
        alt=""
        aria-hidden="true"
        className="h-4 w-4 object-contain"
        height={16}
        src={carbonLogo}
        width={16}
      />
      Gerado pelo Carbon Flow
    </span>
  );
}
