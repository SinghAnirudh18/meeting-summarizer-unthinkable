"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background gradient blobs */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% 40%, rgba(99,102,241,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 60%, rgba(139,92,246,0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 text-center max-w-3xl mx-auto animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              boxShadow: "0 0 30px rgba(99,102,241,0.4)",
            }}
          >
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight">MeetAI</span>
        </div>

        {/* Hero headline */}
        <h1 className="text-5xl sm:text-6xl font-bold leading-tight mb-6">
          Meetings that{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #6366f1, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            remember
          </span>{" "}
          and{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #6366f1, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            understand
          </span>
        </h1>

        <p className="text-xl text-slate-400 mb-10 leading-relaxed max-w-xl mx-auto">
          Video conferencing with AI-powered transcription, summaries, decisions,
          action items — and a real-time meeting copilot that knows everything
          you've ever discussed.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/auth/register" className="btn-primary text-lg px-8 py-3.5">
            Get started — it&apos;s free
          </Link>
          <Link href="/auth/login" className="btn-secondary text-lg px-8 py-3.5">
            Sign in
          </Link>
        </div>

        {/* Feature pills */}
        <div className="mt-14 flex flex-wrap justify-center gap-3">
          {[
            "🎥 HD Video Conferencing",
            "📝 AI Transcription",
            "🎯 Action Items",
            "🔍 Meeting Search",
            "🤖 AI Copilot",
          ].map((feat) => (
            <span
              key={feat}
              className="px-4 py-2 rounded-full text-sm font-medium glass"
              style={{ color: "#94a3b8" }}
            >
              {feat}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
