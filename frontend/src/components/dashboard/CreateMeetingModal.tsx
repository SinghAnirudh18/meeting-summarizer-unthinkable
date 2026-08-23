"use client";

import { useState } from "react";
import { meetingsApi, type Meeting } from "@/lib/services";
import type { AxiosError } from "axios";

interface CreateMeetingModalProps {
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
}

export default function CreateMeetingModal({ onClose, onCreated }: CreateMeetingModalProps) {
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    setIsLoading(true);
    try {
      const meeting = await meetingsApi.create({ title: title.trim() });
      onCreated(meeting);
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail: string }>;
      setError(axiosErr.response?.data?.detail ?? "Failed to create meeting");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="glass rounded-2xl p-6 w-full max-w-md animate-fade-in"
        style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">New meeting</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="meeting-title" className="block text-sm font-medium text-slate-300 mb-1.5">
              Meeting title
            </label>
            <input
              id="meeting-title"
              type="text"
              autoFocus
              required
              className="input-field"
              placeholder="e.g. Weekly sync, Product review..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="create-meeting-submit"
              disabled={isLoading || !title.trim()}
              className="btn-primary flex-1"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                "Create & join"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
