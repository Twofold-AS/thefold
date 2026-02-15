"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { setToken } from "@/lib/auth";
import { requestOtp, verifyOtp } from "@/lib/api";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("from") || "/home";
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") {
      codeRefs.current[0]?.focus();
    }
  }, [step]);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Skriv inn e-postadressen din");
      return;
    }

    setLoading(true);
    try {
      await requestOtp(trimmed);
      setStep("code");
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(codeOverride?: string[]) {
    setError("");
    const digits = codeOverride || code;
    const fullCode = digits.join("");

    if (fullCode.length !== 6) return;

    setLoading(true);
    try {
      const result = await verifyOtp(email.trim().toLowerCase(), fullCode);

      if (!result.success) {
        setError(result.error || "Ugyldig kode");
        if (result.error?.includes("ny kode")) {
          setCode(["", "", "", "", "", ""]);
          setStep("email");
        }
        return;
      }

      if (result.token) {
        setToken(result.token);
        window.location.href = redirectTo;
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5 && newCode.every((d) => d !== "")) {
      setTimeout(() => handleVerifyOtp(newCode), 100);
    }
  }

  function handleCodeKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter") {
      handleVerifyOtp();
    }
  }

  function handleCodePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newCode = [...code];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || "";
    }
    setCode(newCode);

    const lastIdx = Math.min(pasted.length, 6) - 1;
    if (lastIdx >= 0) {
      codeRefs.current[lastIdx]?.focus();
    }
    if (pasted.length === 6) {
      setTimeout(() => handleVerifyOtp(newCode), 100);
    }
  }

  async function handleResendCode() {
    if (cooldown > 0) return;
    setError("");
    setCode(["", "", "", "", "", ""]);
    setLoading(true);
    try {
      await requestOtp(email.trim().toLowerCase());
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-page)" }}>
      {/* Centered side-by-side layout */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="flex items-center gap-12 lg:gap-16">
          {/* Left: Planet image */}
          <div className="hidden lg:block flex-shrink-0 w-[440px] h-[440px] overflow-hidden">
            <Image
              src="/images/planet.png"
              alt=""
              width={440}
              height={440}
              className="w-full h-full object-cover"
              priority
              unoptimized
            />
          </div>

          {/* Right: Login card */}
          <div
            className="w-[420px]"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "0",
              padding: "32px",
              minHeight: "480px",
            }}
          >
            <div className="mb-10">
              <h1>
                <span className="font-display text-[32px] block mb-1" style={{ color: "var(--text-secondary)" }}>
                  Logg inn p&aring;
                </span>
                <span className="font-brand text-[48px] block" style={{ color: "var(--text-primary)", lineHeight: "1.1" }}>
                  TheFold
                </span>
              </h1>
              <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                An AI that actually commits.
              </p>
            </div>

            {step === "email" ? (
              <form onSubmit={handleRequestOtp} className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    E-post
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="deg@twofold.no"
                    className="input-field"
                    autoFocus
                    autoComplete="email"
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div
                    className="text-sm px-3 py-2"
                    style={{
                      color: "var(--error)",
                      background: "rgba(239, 68, 68, 0.1)",
                      borderLeft: "3px solid var(--error)",
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="btn-primary w-full justify-center"
                >
                  {loading ? (
                    <>
                      <div
                        className="w-4 h-4 border-2 rounded-full animate-spin"
                        style={{
                          borderColor: "var(--border)",
                          borderTopColor: "var(--text-primary)",
                        }}
                      />
                      Logger inn...
                    </>
                  ) : (
                    "Logg inn"
                  )}
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <p
                  className="text-sm text-center"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Vi sendte en kode til{" "}
                  <span style={{ color: "var(--text-primary)" }}>{email}</span>
                </p>

                <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { codeRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      disabled={loading}
                      className="input-field text-center font-mono text-2xl font-bold"
                      style={{
                        width: "48px",
                        height: "56px",
                        padding: "0",
                        caretColor: "transparent",
                      }}
                    />
                  ))}
                </div>

                {error && (
                  <div
                    className="text-sm px-3 py-2"
                    style={{
                      color: "var(--error)",
                      background: "rgba(239, 68, 68, 0.1)",
                      borderLeft: "3px solid var(--error)",
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  onClick={() => handleVerifyOtp()}
                  disabled={loading || code.some((d) => !d)}
                  className="btn-primary w-full justify-center"
                >
                  {loading ? (
                    <>
                      <div
                        className="w-4 h-4 border-2 rounded-full animate-spin"
                        style={{
                          borderColor: "var(--border)",
                          borderTopColor: "var(--text-primary)",
                        }}
                      />
                      Verifiserer...
                    </>
                  ) : (
                    "Logg inn"
                  )}
                </button>

                <div
                  className="flex items-center justify-between text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  <button
                    onClick={() => {
                      setStep("email");
                      setError("");
                      setCode(["", "", "", "", "", ""]);
                    }}
                    className="hover:underline"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Endre e-post
                  </button>
                  <button
                    onClick={handleResendCode}
                    disabled={cooldown > 0 || loading}
                    className="hover:underline disabled:opacity-50 disabled:no-underline"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {cooldown > 0 ? `Send igjen (${cooldown}s)` : "Send kode igjen"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-6 flex flex-col items-center gap-2">
        <Image src="/logo.svg" alt="TheFold" width={24} height={24} />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Twofold AS &middot; &copy; 2025
        </p>
      </div>
    </div>
  );
}
