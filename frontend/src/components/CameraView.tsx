"use client";

import { useEffect, useRef, useState } from "react";

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
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

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
    <div className="relative overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-auto w-full -scale-x-100"
      />
      {!streaming && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          Requesting camera…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 p-4 text-center text-white">
          Camera error: {error}
        </div>
      )}
    </div>
  );
}
