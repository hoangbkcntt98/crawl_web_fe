"use client";

import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/paths";

export default function LogoutButton({
  className,
  label = "Logout",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();

  async function logout() {
    await fetch(apiPath("/api/auth/logout"), { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className={className} onClick={logout} type="button">
      {label}
    </button>
  );
}
