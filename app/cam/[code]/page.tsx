import type { Metadata, Viewport } from "next";
import { CamPhone } from "@/components/CamPhone";

export const metadata: Metadata = { title: "Câmera virtual · MEGA HUB AI" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", themeColor: "#000000" };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CamPhone code={code.toUpperCase()} />;
}
