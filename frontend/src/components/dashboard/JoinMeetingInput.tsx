"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinMeetingInput() {
  const [meetingId, setMeetingId] = useState("");
  const router = useRouter();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const id = meetingId.trim();
    if (!id) return;
    router.push(`/meeting/${id}/lobby`);
  };

  return (
    <div className="glass rounded-xl p-4">
      <p className="text-sm text-slate-400 mb-3 font-medium">Join a meeting</p>
      <form onSubmit={handleJoin} className="flex gap-3">
        <input
          id="join-meeting-id"
          type="text"
          className="input-field flex-1"
          placeholder="Enter meeting ID or link..."
          value={meetingId}
          onChange={(e) => {
            // Support both full URLs and bare IDs
            const val = e.target.value;
            const match = val.match(/\/meeting\/([^/]+)/);
            setMeetingId(match ? match[1] : val);
          }}
        />
        <button
          type="submit"
          id="join-meeting-submit"
          disabled={!meetingId.trim()}
          className="btn-primary shrink-0"
        >
          Join
        </button>
      </form>
    </div>
  );
}
