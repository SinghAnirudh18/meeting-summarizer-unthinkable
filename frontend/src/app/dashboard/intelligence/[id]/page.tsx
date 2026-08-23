"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { audioApi, type Citation, type MeetingIntelligence } from "@/lib/services";
import Link from "next/link";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: Date;
}

export default function MeetingIntelligencePage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<MeetingIntelligence | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState("");

  // AI Copilot Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [isResummarizing, setIsResummarizing] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Audio Player State
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioAvailable, setAudioAvailable] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated || !jobId) return;
    audioApi
      .getJobIntelligence(jobId)
      .then((res) => {
        setData(res);
        setChatMessages([
          {
            id: "welcome-1",
            role: "assistant",
            content: `👋 Hello! I have processed **${res.job.file_name}** with **GPU Whisper** & **AI Intelligence**. Ask me any question about the discussion, quotes, decisions, or timeline!`,
            timestamp: new Date(),
          },
        ]);
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || "Failed to load meeting intelligence.");
      })
      .finally(() => setIsFetching(false));
  }, [isAuthenticated, jobId]);

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Audio Controls
  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {
        setAudioAvailable(false);
      });
    }
  };

  const seekTo = (seconds: number, autoPlay = true) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, seconds);
    setCurrentTime(seconds);
    if (autoPlay) {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const skipSeconds = (delta: number) => {
    if (audioRef.current) {
      seekTo(audioRef.current.currentTime + delta, isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
      setAudioAvailable(true);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    seekTo(newTime, isPlaying);
  };

  const handleRateChange = (rate: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };

  const handleToggleAction = async (itemId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "Completed" ? "Pending" : "Completed";
    try {
      const updated = await audioApi.toggleAction(itemId, nextStatus);
      if (data) {
        setData({
          ...data,
          action_items: data.action_items.map((item) =>
            item.id === itemId ? { ...item, status: updated.status } : item
          ),
        });
      }
    } catch {
      // optimistic rollback
    }
  };

  const handleResummarize = async () => {
    if (!jobId || isResummarizing) return;
    setIsResummarizing(true);
    setSummaryMessage("");
    try {
      const updatedData = await audioApi.resummarize(jobId);
      setData(updatedData);
      setSummaryMessage("✨ Intelligence and speaker diarization refreshed successfully!");
      setTimeout(() => setSummaryMessage(""), 5000);
    } catch (err: any) {
      setSummaryMessage(err?.response?.data?.detail || "Failed to regenerate summary.");
      setTimeout(() => setSummaryMessage(""), 6000);
    } finally {
      setIsResummarizing(false);
    }
  };

  const handleAskQuestion = async (e?: React.FormEvent, presetQuestion?: string) => {
    if (e) e.preventDefault();
    const query = (presetQuestion || chatInput).trim();
    if (!query || isAsking || !jobId) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!presetQuestion) setChatInput("");
    setIsAsking(true);

    try {
      const response = await audioApi.askQuestion(jobId, query);
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.answer,
        citations: response.citations,
        timestamp: new Date(),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `⚠️ Sorry, could not generate an answer: ${
          err?.response?.data?.detail || err.message || "Unknown error"
        }`,
        timestamp: new Date(),
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsAsking(false);
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  if (isFetching || isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[#0a0a10]">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
        <p className="text-slate-300 text-sm font-medium">Loading Meeting Intelligence...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen flex items-center justify-center px-4 bg-[#0a0a10]">
        <div className="glass rounded-3xl p-8 max-w-md text-center border border-red-500/20">
          <p className="text-red-300 font-bold mb-2">Error Loading Intelligence</p>
          <p className="text-slate-400 text-sm mb-6">{error || "Meeting file not found"}</p>
          <Link href="/dashboard" className="btn-primary">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const rawSegments = data.transcript_segments || [];
  
  // Deduplicate micro repetitions
  const cleanSegments = [];
  let prevText = "";
  for (const seg of rawSegments) {
    const norm = seg.text.toLowerCase().trim();
    if (norm === prevText && norm.length < 15) {
      if (cleanSegments.length > 0) {
        cleanSegments[cleanSegments.length - 1].end_time = Math.max(
          cleanSegments[cleanSegments.length - 1].end_time,
          seg.end_time
        );
      }
      continue;
    }
    prevText = norm;
    cleanSegments.push(seg);
  }

  const uniqueSpeakers = Array.from(new Set(cleanSegments.map((s) => s.speaker))).filter(Boolean);
  const streamUrl = audioApi.getStreamUrl(jobId);

  return (
    <div className="min-h-screen bg-[#0a0b12] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={streamUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setAudioAvailable(false)}
      />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-[#0d0e1a]/95 backdrop-blur-xl border-b border-white/[0.08] px-4 sm:px-8 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          
          {/* Left: Back Link & Title */}
          <div className="flex items-center gap-3.5 min-w-0">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white border border-white/[0.08] transition-all flex items-center gap-1.5 text-xs font-semibold shrink-0"
            >
              <span>←</span>
              <span>Meetings</span>
            </Link>
            <div className="h-5 w-[1px] bg-white/10 hidden sm:block shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                <span className="truncate">{data.job.file_name}</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">
                {cleanSegments.length} dialogue turns • {uniqueSpeakers.length} participants {duration > 0 ? `• ${formatSeconds(duration)}` : ""}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
            <Link
              href={`/dashboard/intelligence/${jobId}/transcript`}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/25 border border-indigo-400/30 active:scale-95"
            >
              <span>📜</span>
              <span>See Complete Transcript</span>
              <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-extrabold">
                {cleanSegments.length}
              </span>
            </Link>

            <button
              type="button"
              onClick={handleResummarize}
              disabled={isResummarizing}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.1] transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Re-run AI synthesis"
            >
              {isResummarizing ? (
                <>
                  <div className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>Regenerate</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Status Toast Banner */}
        {summaryMessage && (
          <div className="p-4 rounded-2xl bg-indigo-950/90 border border-indigo-500/40 text-indigo-200 text-xs sm:text-sm font-medium shadow-xl animate-fadeIn flex items-center justify-between">
            <span>{summaryMessage}</span>
            <button onClick={() => setSummaryMessage("")} className="text-indigo-400 hover:text-white ml-4">✕</button>
          </div>
        )}

        {/* 1. Sleek Modern Audio Player */}
        <div className="rounded-2xl p-4 sm:p-5 bg-[#121320] border border-white/[0.08] shadow-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            
            {/* Play & Skip Controls */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
              <button
                type="button"
                onClick={() => skipSeconds(-10)}
                className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs flex items-center justify-center transition-colors"
                title="Rewind 10s"
              >
                ⏪ 10s
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all transform active:scale-95 shrink-0"
              >
                {isPlaying ? (
                  <span className="text-sm font-bold">⏸</span>
                ) : (
                  <span className="text-sm font-bold ml-0.5">▶</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => skipSeconds(10)}
                className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs flex items-center justify-center transition-colors"
                title="Fast-forward 10s"
              >
                10s ⏩
              </button>

              {/* Time indicator */}
              <div className="flex items-baseline gap-1 font-mono text-xs text-slate-300 pl-2">
                <span className="font-bold text-white">{formatSeconds(currentTime)}</span>
                <span className="text-slate-500">/</span>
                <span>{formatSeconds(duration)}</span>
              </div>
            </div>

            {/* Scrubber Range Slider */}
            <div className="flex-1 w-full flex items-center px-1">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeekChange}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
              />
            </div>

            {/* Playback Speed Switcher */}
            <div className="flex items-center gap-1 bg-white/[0.05] p-1 rounded-xl border border-white/[0.06] shrink-0">
              {[1, 1.25, 1.5, 2].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRateChange(r)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    playbackRate === r
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Executive Synthesis & Summary Card */}
        {data.summary?.executive_summary && (
          <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-[#151628] via-[#121320] to-[#0f101a] border border-indigo-500/20 shadow-2xl space-y-6">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-lg shadow-inner">
                  🎯
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white">
                    Executive Synthesis & Summary
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Comprehensive multi-turn analysis generated by AI
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                ✨ AI Analyzed
              </span>
            </div>

            {/* Paragraphs */}
            <div className="text-slate-200 text-sm sm:text-base leading-relaxed space-y-3 font-normal">
              {data.summary.executive_summary.split("\n\n").map((para, idx) => (
                <p key={idx} className="leading-relaxed">
                  {para}
                </p>
              ))}
            </div>

            {/* Key Topics & Takeaways Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-white/[0.08]">
              
              {/* Key Topics */}
              {data.summary.key_topics && data.summary.key_topics.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🏷️</span>
                    <span>Key Topics</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {data.summary.key_topics.map((t, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/10 text-indigo-200 border border-indigo-500/20 shadow-sm"
                      >
                        {t.startsWith("#") ? t : `#${t}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Takeaways */}
              {data.summary.key_takeaways && data.summary.key_takeaways.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📌</span>
                    <span>Key Takeaways</span>
                  </h3>
                  <ul className="space-y-2.5">
                    {data.summary.key_takeaways.map((item, idx) => (
                      <li key={idx} className="text-xs sm:text-sm text-slate-300 flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 shrink-0 shadow-sm" />
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Decisions & Action Items Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Key Decisions Card */}
          <div className="rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-[#101918] via-[#10141a] to-[#0e1017] border border-emerald-500/20 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center text-sm font-bold">
                  ⚖️
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  Key Decisions ({data.decisions?.length || 0})
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[11px] font-bold">
                Agreed
              </span>
            </div>

            {(!data.decisions || data.decisions.length === 0) ? (
              <p className="text-xs text-slate-400 italic py-4">No explicit decisions recorded in this conversation.</p>
            ) : (
              <div className="space-y-3">
                {data.decisions.map((dec) => (
                  <div
                    key={dec.id}
                    className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-emerald-500/30 transition-all space-y-2 group"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">✓</span>
                        <span>{dec.speaker}</span>
                      </span>
                      {dec.timestamp_seconds > 0 && (
                        <button
                          type="button"
                          onClick={() => seekTo(dec.timestamp_seconds, true)}
                          className="text-[11px] font-mono text-slate-400 group-hover:text-emerald-300 bg-white/[0.05] px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <span>▶</span>
                          <span>{formatSeconds(dec.timestamp_seconds)}</span>
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-100 leading-snug">{dec.decision_text}</p>
                    {dec.context_snippet && (
                      <p className="text-xs text-slate-400 italic bg-black/25 p-2.5 rounded-xl border border-white/[0.04]">
                        "{dec.context_snippet}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Items Card */}
          <div className="rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-[#1a1612] via-[#141215] to-[#0e1017] border border-amber-500/20 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center text-sm font-bold">
                  📌
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  Action Items ({data.action_items?.length || 0})
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[11px] font-bold">
                Follow-ups
              </span>
            </div>

            {(!data.action_items || data.action_items.length === 0) ? (
              <p className="text-xs text-slate-400 italic py-4">No action items detected in this conversation.</p>
            ) : (
              <div className="space-y-3">
                {data.action_items.map((act) => {
                  const isCompleted = act.status === "Completed";
                  return (
                    <div
                      key={act.id}
                      className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
                        isCompleted
                          ? "bg-white/[0.02] border-white/[0.04] opacity-50"
                          : "bg-white/[0.03] border-white/[0.06] hover:border-amber-500/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isCompleted}
                        onChange={() => handleToggleAction(act.id, act.status)}
                        className="mt-1 w-4 h-4 rounded bg-slate-800 border-white/20 text-amber-500 focus:ring-amber-500 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                        <span className={`text-sm font-medium leading-snug break-words ${isCompleted ? "line-through text-slate-400" : "text-slate-100"}`}>
                          {act.task}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 font-semibold">
                            👤 {act.owner}
                          </span>
                          {act.deadline && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-semibold">
                              📅 {act.deadline}
                            </span>
                          )}
                          {act.timestamp_seconds > 0 && (
                            <button
                              type="button"
                              onClick={() => seekTo(act.timestamp_seconds, true)}
                              className="font-mono text-slate-400 hover:text-amber-300 bg-white/[0.05] px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                            >
                              <span>▶</span>
                              <span>{formatSeconds(act.timestamp_seconds)}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* 4. Complete Transcript Dedicated Hub Card */}
        <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-[#17152b] via-[#131322] to-[#161426] border border-violet-500/20 shadow-2xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/25 uppercase tracking-wider">
                  📜 Full Dialogue Archive
                </span>
                <span className="text-xs text-slate-400">• {cleanSegments.length} Diarized Turns</span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                Complete Conversation Transcript
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                View the complete formatted conversation script with speaker identifiers, interactive search, and click-to-play timestamps on the dedicated page.
              </p>

              {/* Speaker List Preview */}
              {uniqueSpeakers.length > 0 && (
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  <span className="text-xs text-slate-400 font-semibold">Speakers:</span>
                  {uniqueSpeakers.map((spk, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 rounded-lg bg-white/[0.06] text-slate-200 text-xs font-semibold border border-white/[0.08]"
                    >
                      {spk}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
              <Link
                href={`/dashboard/intelligence/${jobId}/transcript`}
                className="px-6 py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-xl shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <span>📜</span>
                <span>Open Full Transcript Page</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>

        {/* 5. Interactive Ask AI Copilot */}
        <div className="rounded-3xl p-6 sm:p-8 bg-[#121320] border border-white/[0.08] shadow-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-lg shadow-inner">
                🤖
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-white">Ask AI Meeting Copilot</h3>
                <p className="text-xs text-slate-400 font-medium">Contextual answers grounded in the conversation transcript</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
              Interactive Q&A
            </span>
          </div>

          {/* Quick Prompts */}
          <div className="flex flex-wrap gap-2">
            {[
              "What was the main purpose of this call?",
              "What were the key decisions finalized?",
              "What are the assigned action items and deadlines?",
            ].map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAskQuestion(undefined, p)}
                disabled={isAsking}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-200 border border-white/[0.08] hover:border-indigo-500/30 transition-all disabled:opacity-50 text-left"
              >
                💡 {p}
              </button>
            ))}
          </div>

          {/* Chat Messages Log */}
          <div className="h-64 sm:h-72 overflow-y-auto space-y-4 p-4 rounded-2xl bg-[#0c0d16] border border-white/[0.04]">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/20"
                      : "bg-white/[0.05] border border-white/[0.08] text-slate-200"
                  }`}
                >
                  <p className="whitespace-pre-line select-text">{msg.content}</p>

                  {/* Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                        🔗 Audio Citations:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((cit, cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() => seekTo(cit.timestamp_seconds, true)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-200 text-[11px] font-mono border border-indigo-500/30 transition-colors flex items-center gap-1.5"
                          >
                            <span>▶ {cit.speaker} ({formatSeconds(cit.timestamp_seconds)})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isAsking && (
              <div className="flex items-center gap-2 text-xs text-indigo-400 animate-pulse p-2">
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                <span>AI Copilot is analyzing the transcript...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Ask Input Bar */}
          <form onSubmit={handleAskQuestion} className="flex gap-2.5">
            <input
              type="text"
              placeholder="Ask anything about this meeting..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isAsking}
              className="input-field flex-1 text-xs sm:text-sm py-3 px-4 bg-white/[0.04] border-white/[0.08] rounded-2xl focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={isAsking || !chatInput.trim()}
              className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 shrink-0"
            >
              Ask AI
            </button>
          </form>
        </div>

      </main>
    </div>
  );
}
