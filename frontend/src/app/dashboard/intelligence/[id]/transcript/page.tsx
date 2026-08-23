"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { audioApi, type MeetingIntelligence, type TranscriptSegment } from "@/lib/services";
import Link from "next/link";

// Vibrant speaker color palette generator
const SPEAKER_COLORS = [
  { bg: "from-indigo-600 to-violet-600", text: "text-indigo-300", badge: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200", bubble: "bg-indigo-950/40 border-indigo-500/30" },
  { bg: "from-emerald-600 to-teal-600", text: "text-emerald-300", badge: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200", bubble: "bg-emerald-950/40 border-emerald-500/30" },
  { bg: "from-amber-600 to-orange-600", text: "text-amber-300", badge: "bg-amber-500/15 border-amber-500/30 text-amber-200", bubble: "bg-amber-950/40 border-amber-500/30" },
  { bg: "from-rose-600 to-pink-600", text: "text-rose-300", badge: "bg-rose-500/15 border-rose-500/30 text-rose-200", bubble: "bg-rose-950/40 border-rose-500/30" },
  { bg: "from-cyan-600 to-blue-600", text: "text-cyan-300", badge: "bg-cyan-500/15 border-cyan-500/30 text-cyan-200", bubble: "bg-cyan-950/40 border-cyan-500/30" },
  { bg: "from-fuchsia-600 to-purple-600", text: "text-fuchsia-300", badge: "bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-200", bubble: "bg-fuchsia-950/40 border-fuchsia-500/30" },
];

export default function FullTranscriptPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<MeetingIntelligence | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"bubbles" | "script">("bubbles");
  const [copied, setCopied] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState("");

  // Audio Player State
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
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
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || "Failed to load audio transcript.");
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

  const handleCopyTranscript = () => {
    if (!data?.transcript_segments) return;
    const fullText = data.transcript_segments
      .map((s) => `[${formatSeconds(s.start_time)} - ${formatSeconds(s.end_time)}] ${s.speaker}:\n${s.text}\n`)
      .join("\n");
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadText = () => {
    if (!data) return;
    const fullText = (data.transcript_segments || [])
      .map((s) => `[${formatSeconds(s.start_time)} - ${formatSeconds(s.end_time)}] ${s.speaker}:\n${s.text}\n`)
      .join("\n");
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.job.file_name.replace(/\.[^/.]+$/, "")}_complete_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isFetching || isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[#0a0a0f]">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
        <p className="text-slate-300 text-sm font-medium">Loading Complete Transcript...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen flex items-center justify-center px-4 bg-[#0a0a0f]">
        <div className="glass rounded-3xl p-8 max-w-md text-center border border-red-500/20">
          <p className="text-red-300 font-bold mb-2">Transcript Unavailable</p>
          <p className="text-slate-400 text-sm mb-6">{error || "Audio job not found"}</p>
          <Link href={`/dashboard/intelligence/${jobId}`} className="btn-primary">
            ← Back to Intelligence
          </Link>
        </div>
      </div>
    );
  }

  const rawSegments = data.transcript_segments || [];
  
  // Collapse micro-repetitions if any were saved earlier
  const cleanSegments: TranscriptSegment[] = [];
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

  // Speaker color map
  const speakerColorMap = new Map<string, typeof SPEAKER_COLORS[0]>();
  uniqueSpeakers.forEach((spk, idx) => {
    speakerColorMap.set(spk, SPEAKER_COLORS[idx % SPEAKER_COLORS.length]);
  });

  const filteredSegments = cleanSegments.filter((seg) => {
    const matchesSearch =
      seg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      seg.speaker.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSpeaker = selectedSpeaker === "ALL" || seg.speaker === selectedSpeaker;
    return matchesSearch && matchesSpeaker;
  });

  const streamUrl = audioApi.getStreamUrl(jobId);

  return (
    <div className="min-h-screen bg-[#09090f] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
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

      {/* Top Floating Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#0c0c16]/90 backdrop-blur-xl border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/dashboard/intelligence/${jobId}`}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-all flex items-center gap-2 text-xs font-semibold"
            >
              <span>←</span>
              <span>Back to Summary</span>
            </Link>
            <div className="flex flex-col">
              <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span className="text-xl">📜</span>
                <span>Complete Meeting Transcript</span>
              </h1>
              <span className="text-xs text-slate-400 truncate max-w-sm sm:max-w-md">
                {data.job.file_name} • {cleanSegments.length} dialogue turns • {uniqueSpeakers.length} participants
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
            <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode("bubbles")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "bubbles"
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                💬 Chat Turns
              </button>
              <button
                type="button"
                onClick={() => setViewMode("script")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "script"
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                📜 Script Mode
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyTranscript}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
            >
              {copied ? <span>✓ Copied Script!</span> : <span>📋 Copy All</span>}
            </button>

            <button
              type="button"
              onClick={handleDownloadText}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-slate-200 transition-all flex items-center gap-1.5 border border-white/10"
            >
              <span>⬇️ .txt</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Sleek Modern Audio Player Bar */}
        <div className="rounded-2xl p-4 sm:p-5 bg-[#121320] border border-white/[0.08] shadow-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            
            {/* Play & Time Controls */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
              <button
                type="button"
                onClick={() => {
                  if (audioRef.current) seekTo(audioRef.current.currentTime - 10, isPlaying);
                }}
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
                onClick={() => {
                  if (audioRef.current) seekTo(audioRef.current.currentTime + 10, isPlaying);
                }}
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

        {/* Filter & Search Toolbar */}
        <div className="rounded-3xl p-5 bg-[#12121e] border border-white/10 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="w-full sm:max-w-md relative">
              <input
                type="text"
                placeholder="Search dialogue phrases or speaker names..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field w-full text-sm py-2.5 pl-10 pr-4 bg-white/5 border-white/10 rounded-2xl focus:border-indigo-500"
              />
              <span className="absolute left-3.5 top-3 text-slate-400 text-sm">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-3 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="text-xs text-slate-400 font-medium">
              Showing <span className="text-indigo-300 font-bold">{filteredSegments.length}</span> of {cleanSegments.length} dialogue turns
            </div>
          </div>

          {/* Vibrant Speaker Filter Pills */}
          {uniqueSpeakers.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2 border-t border-white/5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                Speakers:
              </span>
              <button
                type="button"
                onClick={() => setSelectedSpeaker("ALL")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  selectedSpeaker === "ALL"
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30 scale-105"
                    : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5"
                }`}
              >
                All Participants ({cleanSegments.length})
              </button>

              {uniqueSpeakers.map((spk) => {
                const color = speakerColorMap.get(spk) || SPEAKER_COLORS[0];
                const count = cleanSegments.filter((s) => s.speaker === spk).length;
                const isSelected = selectedSpeaker === spk;
                return (
                  <button
                    key={spk}
                    type="button"
                    onClick={() => setSelectedSpeaker(spk)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 border ${
                      isSelected
                        ? `bg-gradient-to-r ${color.bg} text-white shadow-lg scale-105 border-white/20`
                        : `${color.badge} hover:opacity-100 opacity-80`
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white/20 text-[11px] font-extrabold flex items-center justify-center">
                      {spk.charAt(0).toUpperCase()}
                    </span>
                    <span>{spk}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Dialogue Stream */}
        {filteredSegments.length === 0 ? (
          <div className="rounded-3xl p-16 bg-[#12121e] border border-white/10 text-center space-y-3">
            <span className="text-4xl">🔍</span>
            <p className="text-base font-bold text-slate-200">No dialogue segments found</p>
            <p className="text-xs text-slate-400">Try adjusting your search query or speaker filter.</p>
          </div>
        ) : viewMode === "bubbles" ? (
          /* Conversational Chat Turns View */
          <div className="space-y-4">
            {filteredSegments.map((seg, idx) => {
              const isActive = currentTime >= seg.start_time && currentTime <= seg.end_time;
              const color = speakerColorMap.get(seg.speaker) || SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
              
              return (
                <div
                  key={seg.id || idx}
                  onClick={() => seekTo(seg.start_time, true)}
                  className={`group relative rounded-3xl p-5 sm:p-6 transition-all duration-200 cursor-pointer border ${
                    isActive
                      ? "bg-indigo-950/60 border-indigo-400 shadow-2xl shadow-indigo-500/20 scale-[1.01]"
                      : "bg-[#11111c] border-white/10 hover:border-white/20 hover:bg-[#151524] shadow-lg"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-3">
                    {/* Speaker Identification Banner */}
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-2xl bg-gradient-to-tr ${color.bg} text-white font-extrabold text-sm flex items-center justify-center shadow-md`}>
                        {(seg.speaker || "S").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm sm:text-base font-bold ${color.text}`}>
                            {seg.speaker}
                          </span>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                              Speaking Now
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Timestamp Play Button */}
                    <button
                      type="button"
                      className={`text-xs font-mono px-3 py-1 rounded-xl transition-all flex items-center gap-1.5 ${
                        isActive
                          ? "bg-indigo-500 text-white font-bold shadow-md shadow-indigo-500/30"
                          : "bg-white/5 text-slate-400 group-hover:text-indigo-300 group-hover:bg-white/10"
                      }`}
                    >
                      <span>▶</span>
                      <span>{formatSeconds(seg.start_time)} - {formatSeconds(seg.end_time)}</span>
                    </button>
                  </div>

                  {/* Clean Dialogue Text */}
                  <div className="pl-0 sm:pl-12">
                    <p className="text-sm sm:text-base leading-relaxed text-slate-100 select-text font-normal">
                      {seg.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Screenplay / Script Mode */
          <div className="rounded-3xl p-6 sm:p-8 bg-[#0e0e18] border border-white/10 shadow-2xl space-y-8 font-sans">
            {filteredSegments.map((seg, idx) => {
              const isActive = currentTime >= seg.start_time && currentTime <= seg.end_time;
              const color = speakerColorMap.get(seg.speaker) || SPEAKER_COLORS[idx % SPEAKER_COLORS.length];

              return (
                <div
                  key={seg.id || idx}
                  className={`p-4 rounded-2xl transition-all ${
                    isActive ? "bg-indigo-950/40 border-l-4 border-indigo-400 text-white shadow-lg" : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => seekTo(seg.start_time, true)}
                      className="text-xs font-mono px-2.5 py-1 rounded-lg bg-white/10 hover:bg-indigo-600 text-slate-300 hover:text-white transition-all flex items-center gap-1"
                    >
                      ▶ {formatSeconds(seg.start_time)}
                    </button>
                    <span className={`font-bold text-sm uppercase tracking-wider ${color.text}`}>
                      {seg.speaker}
                    </span>
                  </div>
                  <p className="text-slate-100 text-sm sm:text-base leading-relaxed pl-3 select-text">
                    {seg.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}

      </main>
    </div>
  );
}
