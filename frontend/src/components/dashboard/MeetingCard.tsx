"use client";

import { useEffect, useState } from "react";
import { type Meeting, type Recording, recordingApi } from "@/lib/services";
import Link from "next/link";

interface MeetingCardProps {
  meeting: Meeting;
}

function StatusBadge({ status }: { status: Meeting["status"] }) {
  const configs = {
    SCHEDULED: { label: "Scheduled", className: "badge badge-blue" },
    ACTIVE: { label: "Live", className: "badge badge-green" },
    ENDED: { label: "Ended", className: "badge badge-gray" },
  };
  const { label, className } = configs[status];
  return (
    <span className={className}>
      {status === "ACTIVE" && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
      )}
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "—";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diff = Math.floor((end - start) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "< 1m";
}

export default function MeetingCard({ meeting }: MeetingCardProps) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useEffect(() => {
    recordingApi.get(meeting.id).then((rec) => {
      if (rec && rec.status === "COMPLETED") {
        setRecording(rec);
      }
    }).catch(() => {});
  }, [meeting.id]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const recordingUrl = `${apiUrl}/api/v1/meetings/${meeting.id}/recording/download`;

  return (
    <>
      <div className="glass glass-hover rounded-xl p-5 flex flex-col gap-3 transition-all duration-200 group animate-fade-in relative">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-white line-clamp-2 group-hover:text-indigo-300 transition-colors">
            {meeting.title}
          </h3>
          <StatusBadge status={meeting.status} />
        </div>

        {/* Meta */}
        <div className="flex flex-col gap-1 text-sm text-slate-400">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="truncate">{meeting.host.full_name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{formatDate(meeting.created_at)}</span>
          </div>
          {meeting.start_time && (
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatDuration(meeting.start_time, meeting.end_time)}</span>
            </div>
          )}
        </div>

        {/* Recording Available Badge */}
        {recording && (
          <div className="mt-1 pt-2 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs text-red-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              Recording Saved
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowVideoModal(true);
              }}
              className="text-xs bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1"
            >
              ▶ Watch Video
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {meeting.participant_count} participant{meeting.participant_count !== 1 ? "s" : ""}
          </div>

          {meeting.status !== "ENDED" ? (
            <Link
              href={`/meeting/${meeting.id}/lobby`}
              className="text-xs text-indigo-400 group-hover:text-indigo-300 font-medium transition-colors"
            >
              Join →
            </Link>
          ) : (
            <span className="text-xs text-slate-500 font-medium">Ended</span>
          )}
        </div>
      </div>

      {/* Video Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="glass rounded-2xl p-6 max-w-3xl w-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-white">📹 {meeting.title} — Recording</h3>
              <button
                onClick={() => setShowVideoModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <video
              controls
              autoPlay
              src={recordingUrl}
              className="w-full rounded-xl aspect-video bg-black"
            />

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-slate-400">
                Duration: {recording?.duration_seconds ? `${Math.ceil(recording.duration_seconds / 60)} mins` : "Full meeting"}
              </span>
              <a
                href={recordingUrl}
                download={`meeting-${meeting.id}.webm`}
                className="btn-primary text-xs px-4 py-2"
              >
                ⬇ Download WebM Video
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
