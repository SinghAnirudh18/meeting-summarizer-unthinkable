"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { audioApi, meetingsApi, type AudioJob, type Meeting } from "@/lib/services";
import MeetingCard from "@/components/dashboard/MeetingCard";
import CreateMeetingModal from "@/components/dashboard/CreateMeetingModal";
import JoinMeetingInput from "@/components/dashboard/JoinMeetingInput";
import UploadAudioModal from "@/components/audio/UploadAudioModal";
import Link from "next/link";

export default function DashboardPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [audioJobs, setAudioJobs] = useState<AudioJob[]>([]);
  const [total, setTotal] = useState(0);
  const [isFetching, setIsFetching] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchData = async () => {
      setIsFetching(true);
      setFetchError("");
      try {
        const [mRes, aRes] = await Promise.all([
          meetingsApi.list({ limit: 20 }),
          audioApi.getJobs().catch(() => []),
        ]);
        setMeetings(mRes.meetings);
        setTotal(mRes.total);
        setAudioJobs(aRes);
      } catch {
        setFetchError("Failed to load dashboard data. Please refresh.");
      } finally {
        setIsFetching(false);
      }
    };
    fetchData();
  }, [isAuthenticated]);

  const handleMeetingCreated = (meeting: Meeting) => {
    setMeetings((prev) => [meeting, ...prev]);
    setTotal((t) => t + 1);
    setShowCreate(false);
    router.push(`/meeting/${meeting.id}/lobby`);
  };

  const handleAudioUploaded = (job: AudioJob) => {
    setAudioJobs((prev) => {
      const filtered = prev.filter((j) => j.id !== job.id);
      return [job, ...filtered];
    });
    setShowUpload(false);
    router.push(`/dashboard/intelligence/${job.id}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12">
      {/* Navigation */}
      <nav className="border-b border-white/[0.06] bg-black/20 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-bold text-lg">MeetAI</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 hidden sm:block">{user?.full_name}</span>
            <button
              id="logout-btn"
              onClick={logout}
              className="btn-secondary text-sm px-3 py-1.5"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">
              Welcome back, {user?.full_name?.split(" ")[0]} 👋
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowUpload(true)}
              className="btn-secondary flex items-center gap-1.5"
            >
              <span>📤</span> Upload Audio
            </button>

            <button
              id="create-meeting-btn"
              onClick={() => setShowCreate(true)}
              className="btn-primary"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New meeting
            </button>
          </div>
        </div>

        {/* Join by ID */}
        <div className="mb-8">
          <JoinMeetingInput />
        </div>

        {/* Processed Audio Intelligence Section */}
        {audioJobs.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span>🎵</span> Processed Audio Intelligence ({audioJobs.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from(new Map(audioJobs.map((j) => [j.id, j])).values()).map((job, idx) => (
                <Link
                  key={`${job.id}-${idx}`}
                  href={`/dashboard/intelligence/${job.id}`}
                  className="glass glass-hover rounded-xl p-5 flex flex-col gap-2 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-white line-clamp-1 group-hover:text-indigo-300 transition-colors">
                      🎵 {job.file_name}
                    </h3>
                    <span className="badge badge-green text-[10px]">
                      {job.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Uploaded {new Date(job.created_at).toLocaleDateString()}
                  </p>
                  <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center text-xs text-indigo-400 font-medium">
                    <span>View Transcript & Intelligence</span>
                    <span>→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Meetings grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Your meetings
              {total > 0 && (
                <span className="ml-2 text-sm text-slate-500 font-normal">({total})</span>
              )}
            </h2>
          </div>

          {fetchError && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm mb-4">
              {fetchError}
            </div>
          )}

          {isFetching ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass rounded-xl h-36 animate-pulse" />
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-white/5">
                <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-400 font-medium">No meetings yet</p>
              <p className="text-slate-500 text-sm mt-1">Create your first meeting or upload audio to get started</p>
              <div className="flex justify-center gap-3 mt-4">
                <button
                  onClick={() => setShowUpload(true)}
                  className="btn-secondary text-sm"
                >
                  Upload Audio
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="btn-primary text-sm"
                >
                  Create meeting
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {meetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create meeting modal */}
      {showCreate && (
        <CreateMeetingModal
          onClose={() => setShowCreate(false)}
          onCreated={handleMeetingCreated}
        />
      )}

      {/* Upload audio modal */}
      {showUpload && (
        <UploadAudioModal
          isOpen={showUpload}
          onClose={() => setShowUpload(false)}
          onSuccess={handleAudioUploaded}
        />
      )}
    </div>
  );
}
