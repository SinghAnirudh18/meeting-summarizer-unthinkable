"use client";

import { useEffect, useState } from "react";
import {
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  StartAudio,
  useAudioPlayback,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { type Meeting } from "@/lib/services";
import { type User } from "@/lib/services";
import ChatPanel from "@/components/meeting/ChatPanel";
import ControlBar from "@/components/meeting/ControlBar";
import ParticipantPanel from "@/components/meeting/ParticipantPanel";

interface MeetingRoomProps {
  meeting: Meeting;
  currentUser: User;
  meetingId: string;
  onLeave: () => void;
}

export default function MeetingRoom({
  meeting,
  currentUser,
  meetingId,
  onLeave,
}: MeetingRoomProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const { localParticipant } = useLocalParticipant();
  const { canPlayAudio, startAudio } = useAudioPlayback();

  useEffect(() => {
    // If microphone or camera are not yet active, safely enable them
    if (localParticipant) {
      if (!localParticipant.isMicrophoneEnabled) {
        localParticipant.setMicrophoneEnabled(true).catch((err) => {
          console.warn("Microphone autostart prevented:", err);
        });
      }
      if (!localParticipant.isCameraEnabled) {
        localParticipant.setCameraEnabled(true).catch((err) => {
          console.warn("Camera autostart prevented:", err);
        });
      }
    }
  }, [localParticipant]);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const toggleParticipants = () => {
    setParticipantsOpen((prev) => {
      const next = !prev;
      if (next) setChatOpen(false);
      return next;
    });
  };

  const toggleChat = () => {
    setChatOpen((prev) => {
      const next = !prev;
      if (next) setParticipantsOpen(false);
      return next;
    });
  };

  const isHost = Boolean(
    meeting?.host?.id &&
      currentUser?.id &&
      String(meeting.host.id).toLowerCase() === String(currentUser.id).toLowerCase()
  );
  const sidebarOpen = chatOpen || participantsOpen;

  return (
    <div className="h-screen flex flex-col" style={{ background: "#0a0a0f" }}>
      {/* Audio Autoplay Unblock Banner */}
      {!canPlayAudio && (
        <div className="bg-indigo-600/90 text-white text-sm px-4 py-2.5 flex items-center justify-between z-50 border-b border-indigo-400/30">
          <div className="flex items-center gap-2">
            <span className="text-base">🔊</span>
            <span>Room audio is currently muted by your browser autoplay policy.</span>
          </div>
          <button
            onClick={startAudio}
            className="bg-white text-indigo-900 font-bold px-3.5 py-1 rounded-lg text-xs hover:bg-slate-100 transition-colors shadow"
          >
            Enable Audio Now
          </button>
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-14 shrink-0 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="font-semibold text-white truncate max-w-[200px] sm:max-w-none">
            {meeting.title}
          </span>
          {meeting.status === "ACTIVE" && (
            <span className="badge badge-green">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          )}
          {isRecording && (
            <span className="badge badge-red flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              REC
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Participants toggle */}
          <button
            onClick={toggleParticipants}
            className={`p-2 rounded-lg transition-all text-sm ${
              participantsOpen
                ? "bg-indigo-500/20 text-indigo-300"
                : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title="Participants"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Chat toggle */}
          <button
            onClick={toggleChat}
            className={`p-2 rounded-lg transition-all ${
              chatOpen
                ? "bg-indigo-500/20 text-indigo-300"
                : "text-slate-400 hover:text-white hover:bg-white/10"
            }`}
            title="Chat"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video grid */}
        <div className="flex-1 relative overflow-hidden">
          <GridLayout
            tracks={tracks}
            style={{ height: "calc(100% - 80px)", padding: "12px" }}
          >
            <ParticipantTile />
          </GridLayout>

          {/* Control bar */}
          <div className="absolute bottom-0 left-0 right-0 h-20 flex items-center justify-center">
            <ControlBar
              isHost={isHost}
              meetingId={meetingId}
              onLeave={onLeave}
              onRecordingChange={setIsRecording}
            />
          </div>
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div
            className="w-80 shrink-0 border-l flex flex-col"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "#111118" }}
          >
            {chatOpen && (
              <ChatPanel
                meetingId={meetingId}
                currentUser={currentUser}
                onClose={() => setChatOpen(false)}
              />
            )}
            {participantsOpen && (
              <ParticipantPanel
                meeting={meeting}
                onClose={() => setParticipantsOpen(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* LiveKit audio renderer + autoplay unblocker */}
      <RoomAudioRenderer />
      <StartAudio label="Click to allow room audio" />
    </div>
  );
}

