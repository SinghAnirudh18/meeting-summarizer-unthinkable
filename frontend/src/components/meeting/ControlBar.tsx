"use client";

import { useState } from "react";
import {
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { meetingsApi, recordingApi } from "@/lib/services";
import { meetingRecorder } from "@/lib/recorder";
import type { AxiosError } from "axios";

interface ControlBarProps {
  isHost: boolean;
  meetingId: string;
  onLeave: () => void;
  onRecordingChange?: (isRecording: boolean) => void;
}

export default function ControlBar({
  isHost,
  meetingId,
  onLeave,
  onRecordingChange,
}: ControlBarProps) {
  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant();
  const room = useRoomContext();

  const [isRecording, setIsRecording] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const toggleMic = async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (e) {
      console.error("Failed to toggle mic:", e);
    }
  };

  const toggleCamera = async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (e) {
      console.error("Failed to toggle camera:", e);
    }
  };

  const toggleScreenShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (e) {
      // User cancelled screen picker
    }
  };

  const toggleRecording = async () => {
    try {
      if (isRecording) {
        // Stop recording via API + stop MediaRecorder (triggers download)
        await recordingApi.stop(meetingId);
        await meetingRecorder.stopRecording(meetingId);
        setIsRecording(false);
        onRecordingChange?.(false);
      } else {
        // Start recording via API
        await recordingApi.start(meetingId);

        // Collect all available audio tracks in the room
        const audioTracks: MediaStreamTrack[] = [];
        room.remoteParticipants.forEach((p) => {
          p.audioTrackPublications.forEach((pub) => {
            if (pub.track?.mediaStreamTrack && pub.track.mediaStreamTrack.readyState === "live") {
              audioTracks.push(pub.track.mediaStreamTrack);
            }
          });
        });
        room.localParticipant.audioTrackPublications.forEach((pub) => {
          if (pub.track?.mediaStreamTrack && pub.track.mediaStreamTrack.readyState === "live") {
            audioTracks.push(pub.track.mediaStreamTrack);
          }
        });

        // Fallback to local participant's microphone publication if publication map was empty
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track?.mediaStreamTrack) {
          const micTrack = micPub.track.mediaStreamTrack;
          if (!audioTracks.includes(micTrack) && micTrack.readyState === "live") {
            audioTracks.push(micTrack);
          }
        }

        await meetingRecorder.startRecording(audioTracks);
        setIsRecording(true);
        onRecordingChange?.(true);
      }
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail: string }>;
      console.error("Recording error:", axiosErr.response?.data?.detail || err);
    }
  };

  const handleEndMeeting = async () => {
    if (!confirm("Are you sure you want to end the meeting for everyone?")) return;
    setIsEnding(true);
    try {
      if (isRecording) {
        await meetingRecorder.stopRecording(meetingId);
      }
      await meetingsApi.end(meetingId);
    } finally {
      onLeave();
    }
  };

  const handleLeave = async () => {
    if (isRecording) {
      await meetingRecorder.stopRecording(meetingId);
    }
    await room.disconnect();
    onLeave();
  };

  return (
    <div
      className="flex items-center gap-2 px-4 py-3 rounded-2xl"
      style={{
        background: "rgba(15,15,25,0.9)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Microphone */}
      <ControlButton
        id="ctrl-mic"
        active={isMicrophoneEnabled}
        onClick={toggleMic}
        title={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
        activeIcon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        }
        inactiveIcon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        }
      />

      {/* Camera */}
      <ControlButton
        id="ctrl-camera"
        active={isCameraEnabled}
        onClick={toggleCamera}
        title={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
        activeIcon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        }
        inactiveIcon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        }
      />

      {/* Screen share */}
      <button
        id="ctrl-screen"
        onClick={toggleScreenShare}
        title={isScreenShareEnabled ? "Stop sharing screen" : "Share screen"}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
          isScreenShareEnabled
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
            : "text-slate-300 hover:text-white hover:bg-white/15 bg-white/8"
        }`}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Recording (host only) */}
      {isHost && (
        <button
          id="ctrl-record"
          onClick={toggleRecording}
          title={isRecording ? "Stop recording" : "Start recording"}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"
              : "bg-white/8 text-slate-300 hover:bg-white/15"
          }`}
        >
          {isRecording ? (
            <span className="w-3.5 h-3.5 rounded-sm bg-red-400" />
          ) : (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />
          )}
        </button>
      )}

      <div className="w-px h-8 bg-white/10 mx-1" />

      {/* Leave */}
      <button
        id="ctrl-leave"
        onClick={handleLeave}
        title="Leave meeting"
        className="px-4 h-11 rounded-full btn-danger text-sm"
      >
        Leave
      </button>

      {/* End (host only) */}
      {isHost && (
        <button
          id="ctrl-end"
          onClick={handleEndMeeting}
          disabled={isEnding}
          title="End meeting for everyone"
          className="px-4 h-11 rounded-full text-sm font-semibold transition-all"
          style={{
            background: "rgba(239,68,68,0.9)",
            color: "white",
          }}
        >
          {isEnding ? "Ending..." : "End for all"}
        </button>
      )}
    </div>
  );
}

// ── ControlButton helper ──────────────────────────────────────────────────────

interface ControlButtonProps {
  id: string;
  active: boolean;
  onClick: () => void;
  title: string;
  activeIcon: React.ReactNode;
  inactiveIcon: React.ReactNode;
}

function ControlButton({
  id,
  active,
  onClick,
  title,
  activeIcon,
  inactiveIcon,
}: ControlButtonProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      title={title}
      className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
        !active
          ? "bg-red-500/20 text-red-400 border border-red-500/30"
          : "text-slate-300 hover:text-white hover:bg-white/15 bg-white/8"
      }`}
    >
      {!active ? inactiveIcon : activeIcon}
    </button>
  );
}

