import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <Shell user={user}>{children}</Shell>;
}
