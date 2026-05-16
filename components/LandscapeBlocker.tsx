"use client";

export default function LandscapeBlocker() {
  return (
    <div className="landscape-blocker fixed inset-0 z-[9999] hidden flex-col items-center justify-center gap-5 bg-neutral-950 px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/[0.07]">
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/80"
        >
          <rect x="5" y="2" width="14" height="20" rx="2.5" />
          <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5" strokeLinecap="round" />
          <path
            d="M9.5 21.5 Q12 23.5 14.5 21.5"
            fill="none"
            strokeWidth="1.5"
            opacity="0.4"
          />
        </svg>
      </div>
      <div>
        <p className="text-[20px] font-bold tracking-[-0.01em] text-white">
          Rotate to portrait
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500">
          PlanR is designed for portrait mode
        </p>
      </div>
    </div>
  );
}
