"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}>
      Sair
    </a>
  );
}
