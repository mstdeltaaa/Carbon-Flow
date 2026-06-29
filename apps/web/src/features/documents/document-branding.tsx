"use client";

import Image from "next/image";

type DocumentLogoProps = {
  companyName: string;
  logoUrl?: string | null;
};

const carbonLogo = "/brand/carbon-flow-logo-on-light-v2.png";

export function DocumentPrimaryLogo({
  companyName,
  logoUrl
}: DocumentLogoProps) {
  const src = logoUrl || carbonLogo;
  const alt = logoUrl ? `Logo de ${companyName}` : "Carbon Flow";

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-[#dfe5e3] bg-white p-2">
      <img alt={alt} className="h-full w-full object-contain" src={src} />
    </div>
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
