"use client";

import { useEffect, useRef, useState } from "react";

import { Card, CardHeader } from "./Card";

type Props = {
  /**
   * Called once the video element is mounted *and* a MediaStream has been
   * attached. Parent uses this ref to hand to MediaPipe.
   */
  onReady?: (video: HTMLVideoElement) => void;
};

export function CameraView({ onReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  // Stash the latest onReady in a ref so the camera-acquisition effect can
  // call it without listing it as a dependency. Without this, every parent
  // re-render hands us a new function reference, our effect tears down (which
  // stops the MediaStream tracks!) and re-acquires the camera — visible to
  // the user as the video flickering off/on.
  // The ref is updated in an effect rather than during render so the new
  // react-hooks/refs lint is happy and we follow React 19 conventions.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStreaming(true);
        onReadyRef.current?.(video);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Card className="overflow-hidden p-3">
      <div className="px-1">
        <CardHeader
          title="Camera"
          subtitle={
            error ? (
              <span className="text-rose-300">error</span>
            ) : streaming ? (
              <span className="text-emerald-300">live</span>
            ) : (
              <span className="text-white/55">requesting…</span>
            )
          }
        />
      </div>
      <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-cover"
        />
        {!streaming && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white/80">
            Requesting camera…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-rose-950/80 p-4 text-center text-sm text-rose-100">
            {error}
          </div>
        )}
      </div>
    </Card>
  );
}
