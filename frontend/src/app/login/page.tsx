"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { setToken } from "@/lib/auth";
import { requestOtp, verifyOtp } from "@/lib/api";
import { ArrowRight, Mail, KeyRound, RotateCw } from "lucide-react";
import { ParticleField } from "@/components/effects/ParticleField";

const Dither = dynamic(() => import("@/components/effects/Dither"), {
  ssr: false,
});

type Step = "email" | "code";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "var(--tf-bg-base)" }}
        />
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
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
      setError("Enter your email address");
      return;
    }
    setLoading(true);
    try {
      await requestOtp(trimmed);
      setStep("code");
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
        setError(result.error || "Invalid code");
        if (result.error?.includes("ny kode")) {
          setCode(["", "", "", "", "", ""]);
          setStep("email");
        }
        return;
      }
      if (result.token) {
        setToken(result.token);
        window.location.href = redirectTo;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative" style={{ background: "var(--tf-bg-base)" }}>
      {/* Dither background */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.2 }}>
        <Dither
          waveColor={[1.0, 0.42, 0.17]}
          disableAnimation={false}
          enableMouseInteraction={false}
          colorNum={4}
          waveAmplitude={0.25}
          waveFrequency={2}
          waveSpeed={0.02}
          pixelSize={3}
        />
      </div>
      {/* Floating ember particles */}
      <div className="absolute inset-0 pointer-events-none">
        <ParticleField count={25} className="opacity-50" />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div
          className="w-full max-w-[420px] rounded-xl p-8 backdrop-blur-sm"
          style={{
            background: "rgba(17, 17, 17, 0.85)",
            border: "1px solid var(--tf-border-faint)",
          }}
        >
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-[10px] mb-3 tracking-[0.2em] uppercase" style={{ color: "var(--tf-text-faint)" }}>
              Sign in to
            </p>
            <h1
              className="text-4xl font-bold tracking-tight mb-2"
              style={{ color: "var(--tf-text-primary)" }}
            >
              The<span style={{ color: "var(--tf-heat)" }}>Fold</span>
            </h1>
            <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
              An AI that actually commits.
            </p>
          </div>

          {step === "email" ? (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--tf-text-secondary)" }}
                >
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--tf-text-faint)" }}
                  />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-lg py-3 pl-10 pr-4 text-sm border outline-none transition-colors"
                    style={{
                      background: "var(--tf-bg-base)",
                      borderColor: "var(--tf-border-faint)",
                      color: "var(--tf-text-primary)",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tf-heat)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tf-border-faint)"; }}
                    autoFocus
                    autoComplete="email"
                    disabled={loading}
                  />
                </div>
              </div>

              {error && (
                <div
                  className="text-sm px-3 py-2 rounded-lg"
                  style={{
                    color: "var(--tf-error)",
                    background: "rgba(235, 52, 36, 0.08)",
                    border: "1px solid rgba(235, 52, 36, 0.15)",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: "var(--tf-heat)",
                  color: "white",
                }}
              >
                {loading ? (
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "white" }}
                  />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="text-center">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3"
                  style={{ background: "rgba(255, 107, 44, 0.08)" }}
                >
                  <KeyRound className="w-5 h-5" style={{ color: "var(--tf-heat)" }} />
                </div>
                <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
                  We sent a code to{" "}
                  <span className="font-medium" style={{ color: "var(--tf-text-primary)" }}>
                    {email}
                  </span>
                </p>
              </div>

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
                    className="text-center font-mono text-2xl font-bold rounded-lg border outline-none transition-colors"
                    style={{
                      width: "48px",
                      height: "56px",
                      background: "var(--tf-bg-base)",
                      borderColor: digit ? "var(--tf-heat)" : "var(--tf-border-faint)",
                      color: "var(--tf-text-primary)",
                      caretColor: "transparent",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tf-heat)"; }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = digit ? "var(--tf-heat)" : "var(--tf-border-faint)";
                    }}
                  />
                ))}
              </div>

              {error && (
                <div
                  className="text-sm px-3 py-2 rounded-lg"
                  style={{
                    color: "var(--tf-error)",
                    background: "rgba(235, 52, 36, 0.08)",
                    border: "1px solid rgba(235, 52, 36, 0.15)",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={() => handleVerifyOtp()}
                disabled={loading || code.some((d) => !d)}
                className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: "var(--tf-heat)", color: "white" }}
              >
                {loading ? (
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "white" }}
                  />
                ) : (
                  "Verify"
                )}
              </button>

              <div
                className="flex items-center justify-between text-xs pt-1"
                style={{ color: "var(--tf-text-muted)" }}
              >
                <button
                  onClick={() => {
                    setStep("email");
                    setError("");
                    setCode(["", "", "", "", "", ""]);
                  }}
                  className="transition-colors hover:underline"
                  style={{ color: "var(--tf-text-secondary)" }}
                >
                  Change email
                </button>
                <button
                  onClick={handleResendCode}
                  disabled={cooldown > 0 || loading}
                  className="flex items-center gap-1 transition-colors disabled:opacity-50"
                  style={{ color: "var(--tf-text-secondary)" }}
                >
                  <RotateCw className="w-3 h-3" />
                  {cooldown > 0 ? `Resend (${cooldown}s)` : "Resend code"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 py-6 flex flex-col items-center">
        <p className="text-xs" style={{ color: "var(--tf-text-faint)" }}>
          Twofold AS &middot; &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
