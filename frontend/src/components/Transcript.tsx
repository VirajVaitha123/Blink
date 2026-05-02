"use client";

import { memo } from "react";

import { Card, CardHeader } from "./Card";

type Props = {
  text: string;
};

export const Transcript = memo(TranscriptInner);

function TranscriptInner({ text }: Props) {
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title="Transcript"
        subtitle={
          <span className="font-mono tabular-nums text-white/55">
            {text.length} chars
          </span>
        }
      />
      <div className="mt-3 min-h-24 whitespace-pre-wrap break-words text-2xl leading-snug text-white sm:text-3xl">
        {text || (
          <span className="text-white/35">
            Composed text will appear here…
          </span>
        )}
        <span className="ml-1 inline-block h-7 w-[3px] animate-pulse rounded-sm bg-white/85 align-middle" />
      </div>
    </Card>
  );
}
