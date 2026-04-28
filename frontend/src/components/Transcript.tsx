"use client";

type Props = {
  text: string;
};

export function Transcript({ text }: Props) {
  return (
    <div className="min-h-24 rounded-lg border border-white/15 bg-black/40 p-4 text-2xl leading-snug text-white">
      {text || (
        <span className="text-white/40">Composed text will appear here…</span>
      )}
      <span className="ml-1 inline-block h-7 w-1 animate-pulse bg-white/80 align-middle" />
    </div>
  );
}
