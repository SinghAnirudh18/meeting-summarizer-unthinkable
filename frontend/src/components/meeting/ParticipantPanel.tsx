"use client";

import { useParticipants } from "@livekit/components-react";
import { type Meeting } from "@/lib/services";

interface ParticipantPanelProps {
  meeting: Meeting;
  onClose: () => void;
}

export default function ParticipantPanel({ meeting, onClose }: ParticipantPanelProps) {
  const participants = useParticipants();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <h3 className="font-semibold text-sm">
          Participants ({participants.length})
        </h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Participant list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {participants.map((p) => (
          <div
            key={p.identity}
            className="flex items-center gap-3 p-2.5 rounded-xl glass"
          >
            {/* Avatar */}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              {(p.name ?? p.identity).charAt(0).toUpperCase()}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {p.name ?? p.identity}
              </p>
              {p.identity === meeting.host.id && (
                <p className="text-xs text-indigo-400">Host</p>
              )}
            </div>

            {/* Mic/camera indicators */}
            <div className="flex items-center gap-1.5">
              {!p.isMicrophoneEnabled && (
                <span title="Muted" className="text-red-400">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                </span>
              )}
              {p.isSpeaking && (
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Speaking" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
