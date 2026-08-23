"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { meetingsApi, type Meeting } from "@/lib/services";
import type { AxiosError } from "axios";

export default function LobbyPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [isFetching, setIsFetching] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [selectedMic, setSelectedMic] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Fetch meeting details
  useEffect(() => {
    if (!isAuthenticated || !meetingId) return;
    const fetchMeeting = async () => {
      try {
        const m = await meetingsApi.get(meetingId);
        setMeeting(m);
      } catch (err) {
        const axiosErr = err as AxiosError<{ detail: string }>;
        setFetchError(axiosErr.response?.data?.detail ?? "Meeting not found");
      } finally {
        setIsFetching(false);
      }
    };
    fetchMeeting();
  }, [isAuthenticated, meetingId]);

  // Enumerate devices and start preview
  useEffect(() => {
    const startPreview = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameras(devices.filter((d) => d.kind === "videoinput"));
        setMics(devices.filter((d) => d.kind === "audioinput"));
      } catch {
        // Permissions denied — user can still join audio-only
        setVideoEnabled(false);
      }
    };
    startPreview();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleJoin = async () => {
    if (!meeting) return;
    setJoinError("");
    setIsJoining(true);

    // Stop the preview stream before joining — LiveKit will take over
    streamRef.current?.getTracks().forEach((t) => t.stop());

    try {
      await meetingsApi.join(meetingId);
      router.push(`/meeting/${meetingId}`);
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail: string }>;
      setJoinError(axiosErr.response?.data?.detail ?? "Failed to join meeting");
      setIsJoining(false);
    }
  };

  if (isFetching || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading meeting...
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <p className="text-red-300 font-medium mb-2">Meeting not found</p>
          <p className="text-slate-400 text-sm mb-4">{fetchError}</p>
          <button onClick={() => router.push("/dashboard")} className="btn-primary">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (meeting?.status === "ENDED") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <p className="text-slate-300 font-medium mb-2">This meeting has ended</p>
          <button onClick={() => router.push("/dashboard")} className="btn-primary mt-4">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">{meeting?.title}</h1>
          <p className="text-slate-400 text-sm mt-1">
            Hosted by {meeting?.host.full_name}
          </p>
        </div>

        {/* Camera preview */}
        <div className="glass rounded-2xl overflow-hidden mb-6 relative aspect-video bg-black/30">
          {videoEnabled ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-3xl font-bold text-slate-300">
                  {user?.full_name?.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {/* Name overlay */}
          <div className="absolute bottom-4 left-4">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-black/50 backdrop-blur text-white">
              {user?.full_name} (You)
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="glass rounded-xl p-5 mb-6">
          <div className="flex justify-center gap-4 mb-5">
            {/* Camera toggle */}
            <button
              onClick={() => {
                const tracks = streamRef.current?.getVideoTracks() ?? [];
                tracks.forEach((t) => { t.enabled = !videoEnabled; });
                setVideoEnabled(!videoEnabled);
              }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                videoEnabled
                  ? "bg-white/10 hover:bg-white/15 text-white"
                  : "bg-red-500/20 text-red-400 border border-red-500/30"
              }`}
              title={videoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {videoEnabled ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
            </button>

            {/* Mic toggle */}
            <button
              onClick={() => {
                const tracks = streamRef.current?.getAudioTracks() ?? [];
                tracks.forEach((t) => { t.enabled = !audioEnabled; });
                setAudioEnabled(!audioEnabled);
              }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                audioEnabled
                  ? "bg-white/10 hover:bg-white/15 text-white"
                  : "bg-red-500/20 text-red-400 border border-red-500/30"
              }`}
              title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              {audioEnabled ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </button>
          </div>

          {/* Device selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cameras.length > 0 && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Camera</label>
                <select
                  className="input-field text-sm py-2"
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                >
                  {cameras.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${cameras.indexOf(cam) + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {mics.length > 0 && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Microphone</label>
                <select
                  className="input-field text-sm py-2"
                  value={selectedMic}
                  onChange={(e) => setSelectedMic(e.target.value)}
                >
                  {mics.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || `Microphone ${mics.indexOf(mic) + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {joinError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center">
            {joinError}
          </div>
        )}

        {/* Join button */}
        <button
          id="join-meeting-btn"
          onClick={handleJoin}
          disabled={isJoining}
          className="btn-primary w-full py-3.5 text-lg"
        >
          {isJoining ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Joining...
            </span>
          ) : (
            "Join meeting"
          )}
        </button>

        <button
          onClick={() => router.push("/dashboard")}
          className="w-full text-center text-sm text-slate-500 hover:text-slate-400 mt-3 py-2 transition-colors"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
