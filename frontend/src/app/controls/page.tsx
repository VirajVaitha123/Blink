import type { Metadata } from "next";

import { ControlsScreen } from "@/components/controls/ControlsScreen";

export const metadata: Metadata = {
  title: "Controls — Blink",
  description:
    "Choose what each eye gesture does and tune how long and how far you need to hold it.",
};

export default function ControlsPage() {
  return <ControlsScreen />;
}
