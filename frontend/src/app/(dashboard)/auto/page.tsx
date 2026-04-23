"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Fase I.0.c — Legacy /auto-rute. Omdirigeres til /cowork?mode=auto.
// Layouten gjør også redirect, men vi beholder en eksplisitt side-stub
// så direkte navigering til /auto ikke trigger 404 på første render.
export default function AutoRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/cowork?mode=auto");
  }, [router]);
  return null;
}
