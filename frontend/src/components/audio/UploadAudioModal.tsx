"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { audioApi, type AudioJob } from "@/lib/services";
import type { AxiosError } from "axios";

interface UploadAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (job: AudioJob) => void;
}

export default function UploadAudioModal({
  isOpen,
  onClose,
  onSuccess,
}: UploadAudioModalProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progressStatus, setProgressStatus] = useState("Idle");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError("");
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setError("");
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select an audio file.");
      return;
    }

    setIsUploading(true);
    setError("");
    setProgressStatus("Uploading file & initializing Groq pipeline...");

    try {
      const job = await audioApi.upload(file);
      setProgressStatus("Processing completed via Groq Intelligence Engine!");
      onSuccess?.(job);
      setTimeout(() => {
        onClose();
        router.push(`/dashboard/intelligence/${job.id}`);
      }, 500);
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail: string | Array<{ msg: string }> }>;
      let msg = "Audio processing failed. Please try again.";
      if (axiosErr.response?.data?.detail) {
        if (typeof axiosErr.response.data.detail === "string") {
          msg = axiosErr.response.data.detail;
        } else if (Array.isArray(axiosErr.response.data.detail)) {
          msg = axiosErr.response.data.detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
        }
      } else if (axiosErr.message) {
        msg = axiosErr.message;
      }
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="glass rounded-2xl p-6 max-w-lg w-full flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>📤</span> Upload Audio for Intelligence
          </h2>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Upload any recorded meeting or audio file (<code className="text-indigo-300">.mp3</code>, <code className="text-indigo-300">.wav</code>, <code className="text-indigo-300">.m4a</code>, <code className="text-indigo-300">.webm</code>, <code className="text-indigo-300">.ogg</code>). Groq Whisper will transcribe with timestamps and Llama 3.3 70B will extract Executive Summary, Key Decisions, and Action Items.
        </p>

        <form onSubmit={handleUpload} className="flex flex-col gap-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-700 hover:border-indigo-500/50 rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer bg-white/5"
            onClick={() => document.getElementById("audio-file-input")?.click()}
          >
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xl">
              🎵
            </div>
            {file ? (
              <div className="text-center">
                <p className="font-semibold text-indigo-300 text-sm">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium text-slate-300">Drag & drop your audio file here</p>
                <p className="text-xs text-slate-500 mt-0.5">or click to browse files</p>
              </div>
            )}
            <input
              id="audio-file-input"
              type="file"
              accept=".mp3,.wav,.m4a,.webm,.ogg,.aac,.flac"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {error && <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">{error}</p>}

          {isUploading && (
            <div className="flex flex-col gap-1.5 py-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>{progressStatus}</span>
                <span className="text-indigo-400 font-semibold animate-pulse">Groq Processing...</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-500 h-2 rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="btn-secondary text-sm px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || isUploading}
              className="btn-primary text-sm px-5 py-2 flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Extract Intelligence</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
