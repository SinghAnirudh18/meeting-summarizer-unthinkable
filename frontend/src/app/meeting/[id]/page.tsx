"use client";

import "@livekit/components-styles";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LiveKitRoom } from "@livekit/components-react";
import { RoomOptions } from "livekit-client";
import { useAuth } from "@/lib/auth";
import { meetingsApi, type Meeting } from "@/lib/services";
import MeetingRoom from "@/components/meeting/MeetingRoom";
import type { AxiosError } from "axios";

export default function MeetingPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [livekitToken, setLivekitToken] = useState("");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [error, setError] = useState("");
  const [isConnecting, setIsConnecting] = useState(true);

  const roomOptions = useMemo<RoomOptions>(
    () => ({
      autoSubscribe: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      publishDefaults: {
        dtx: true,
        red: true,
      },
    }),
    []
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated || !meetingId) return;
    const joinMeeting = async () => {
      try {
        const result = await meetingsApi.join(meetingId);
        setMeeting(result.meeting);
        setLivekitToken(result.livekit_token);
        setLivekitUrl(result.livekit_url);
      } catch (err) {
        const axiosErr = err as AxiosError<{ detail: string }>;
        const msg = axiosErr.response?.data?.detail ?? "Failed to join meeting";
        setError(msg);
      } finally {
        setIsConnecting(false);
      }
    };
    joinMeeting();
  }, [isAuthenticated, meetingId]);

  const handleDisconnect = async () => {
    await meetingsApi.leave(meetingId).catch(() => {});
    router.push("/dashboard");
  };

  if (isLoading || isConnecting) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3">
        <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="text-slate-400">Connecting to meeting...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <p className="text-red-300 font-medium mb-2">Unable to join meeting</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button onClick={() => router.push("/dashboard")} className="btn-primary">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={livekitToken}
      serverUrl={livekitUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL}
      connect={true}
      audio={true}
      video={true}
      options={roomOptions}
      onDisconnected={handleDisconnect}
      style={{ height: "100dvh" }}
    >
      <MeetingRoom
        meeting={meeting!}
        onLeave={handleDisconnect}
        currentUser={user!}
        meetingId={meetingId}
      />
    </LiveKitRoom>
  );
}
