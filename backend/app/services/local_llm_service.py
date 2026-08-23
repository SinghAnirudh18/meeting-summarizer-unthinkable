"""
Local LLM Service — Runs GGUF models from `models/llm/` on GPU/CPU via llama-cpp-python.
Extracts meeting summaries, key decisions, and answers conversational Q&A queries.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent.parent.parent / "models" / "llm"


class LocalLLMService:
    def __init__(self):
        self._llm = None
        self._model_path = self._find_model_path()

    def _find_model_path(self) -> Path | None:
        """Find local GGUF model in models/llm/ directory."""
        if not MODELS_DIR.exists():
            return None

        candidates = [
            MODELS_DIR / "qwen2.5-3b-instruct-q6_k.gguf",
            MODELS_DIR / "DeepSeek-R1-Distill-Qwen-7B-Q2_K.gguf",
        ]
        for c in candidates:
            if c.exists() and c.is_file():
                logger.info("Found local GGUF LLM model: %s", c.name)
                return c

        # Check any .gguf in MODELS_DIR
        for p in MODELS_DIR.glob("*.gguf"):
            logger.info("Found GGUF LLM model: %s", p.name)
            return p
        return None

    def _get_llm(self):
        if self._llm is None and self._model_path and self._model_path.exists():
            try:
                from llama_cpp import Llama
                logger.info("Loading local LLM from %s...", self._model_path.name)
                threads = os.cpu_count() or 8
                # Attempt GPU offload with fallback
                try:
                    self._llm = Llama(
                        model_path=str(self._model_path),
                        n_ctx=2048,
                        n_batch=512,
                        n_threads=threads,
                        n_gpu_layers=-1,  # Offload all layers to GPU
                        verbose=False,
                    )
                    logger.info(
                        "Local LLM %s loaded with n_gpu_layers=-1 (full GPU offload requested)",
                        self._model_path.name,
                    )
                except Exception as gpu_exc:
                    logger.warning("GPU LLM load failed: %s. Falling back to CPU...", gpu_exc)
                    self._llm = Llama(
                        model_path=str(self._model_path),
                        n_ctx=2048,
                        n_batch=512,
                        n_threads=threads,
                        n_gpu_layers=0,
                        verbose=False,
                    )
                    logger.info("Local LLM %s loaded on CPU (n_gpu_layers=0)", self._model_path.name)
            except Exception as exc:
                logger.warning("Failed to initialize local LLM: %s", exc)
                self._llm = None
        return self._llm

    def _parse_llm_json(self, raw_content: str) -> dict:
        content = raw_content.strip()
        # Remove deepseek / thinking tags if present
        if "<think>" in content and "</think>" in content:
            content = content.split("</think>", 1)[-1].strip()

        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            content = "\n".join(lines).strip()
        try:
            return json.loads(content)
        except Exception:
            start_idx = content.find("{")
            end_idx = content.rfind("}")
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                candidate = content[start_idx : end_idx + 1]
                try:
                    return json.loads(candidate)
                except Exception:
                    import re
                    cleaned = re.sub(r",\s*([\]}])", r"\1", candidate)
                    return json.loads(cleaned)
            raise

    def extract_intelligence(
        self, transcript_segments: List[Dict[str, Any]], file_name: str
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Extract Meeting Summary, Decisions, Action Items, and Diarized Speakers using the local GGUF model.
        Falls back to groq_service if local LLM is unavailable.
        """
        if os.environ.get("TESTING") == "1":
            return self._dynamic_fallback_intelligence(transcript_segments, file_name)

        llm = self._get_llm()
        non_empty = [s for s in transcript_segments if s.get("text")]
        full_text = "\n".join(
            f"[{idx}] {seg.get('start_time', 0.0)}s - {seg.get('end_time', 0.0)}s ({seg.get('speaker', 'Speaker')}): {seg.get('text', '')}"
            for idx, seg in enumerate(non_empty)
        )

        if not full_text:
            return self._dynamic_fallback_intelligence(transcript_segments, file_name)

        if llm:
            try:
                logger.info("Extracting intelligence via local LLM (%s)...", self._model_path.name if self._model_path else "local")
                prompt = (
                    "You are an Elite Executive AI Assistant and Expert Meeting Analyst.\n"
                    "You have been provided with the raw audio transcription of an entire meeting or conversation.\n\n"
                    "YOUR CORE MISSIONS:\n"
                    "1. SPEAKER IDENTIFICATION & CONVERSATIONAL DIARIZATION:\n"
                    "   - Carefully analyze the whole transcript to determine who is speaking in each turn.\n"
                    "   - Extract names and roles from context (e.g. 'Hi, I am David', 'Thanks Alex', 'As the product lead...', questions and responses).\n"
                    "   - Group fragmented sentences into coherent, natural dialogue turns per speaker.\n"
                    "   - Fix minor ASR speech recognition glitches or stutters while preserving exact meaning.\n"
                    "   - For each turn, assign the identified speaker name (e.g. 'David (Product)', 'Sarah (Engineering)', 'Alex (DevOps)'). If a speaker's name is completely unmentioned, assign a clear consistent identifier ('Speaker 1 (Host)', 'Speaker 2').\n"
                    "2. DETAILED & COMPREHENSIVE EXECUTIVE SUMMARY:\n"
                    "   - Provide a multi-section, highly detailed summary (3-5 comprehensive paragraphs covering: Meeting Context & Purpose, Key Discussion Points & Debates, Technical/Product Solutions Evaluated, Decisions Finalized, and Strategic Next Steps).\n"
                    "   - Explicitly mention speakers by name, key metrics, timelines, and tools/technologies discussed.\n"
                    "3. KEY TOPICS & ACTIONABLE TAKEAWAYS:\n"
                    "   - 4-8 topic hashtags capturing all major themes.\n"
                    "   - 4-8 rich, granular takeaways with concrete details.\n"
                    "4. KEY DECISIONS & ACTION ITEMS:\n"
                    "   - Extract every decision with speaker attribution, timestamp, and quotation snippet.\n"
                    "   - Extract every actionable task with assigned owner, deadline, timestamp, and status 'Pending'.\n\n"
                    "Return ONLY a valid JSON object matching this exact schema:\n"
                    "{\n"
                    '  "executive_summary": "Deep, detailed multi-paragraph executive summary.",\n'
                    '  "key_topics": ["#topic1", "#topic2", "#topic3"],\n'
                    '  "key_takeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],\n'
                    '  "decisions": [\n'
                    '    {"decision_text": "...", "speaker": "Speaker Name", "timestamp_seconds": 0.0, "context_snippet": "..."}\n'
                    '  ],\n'
                    '  "action_items": [\n'
                    '    {"task": "...", "owner": "Assigned Person", "deadline": "...", "timestamp_seconds": 0.0, "status": "Pending"}\n'
                    '  ],\n'
                    '  "formatted_transcript": [\n'
                    '    {"sequence_order": 0, "speaker": "David (Product)", "text": "...", "start_time": 0.0, "end_time": 15.0},\n'
                    '    {"sequence_order": 1, "speaker": "Sarah (Engineering)", "text": "...", "start_time": 15.2, "end_time": 32.0}\n'
                    '  ]\n'
                    "}\n\n"
                    f"Meeting File: {file_name}\n"
                    f"Raw Transcript:\n{full_text}"
                )

                response = llm.create_chat_completion(
                    messages=[
                        {"role": "system", "content": "You are a professional executive meeting analyst and speech diarization expert. You output valid JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=1200,
                )

                content = response["choices"][0]["message"]["content"] or "{}"
                data = self._parse_llm_json(content)

                exec_summary = str(data.get("executive_summary") or "").strip()
                if not exec_summary:
                    exec_summary = self._synthesize_summary_from_segments(non_empty, file_name)

                key_topics = data.get("key_topics", [])
                if not isinstance(key_topics, list) or not key_topics:
                    key_topics = ["#meeting-notes", "#discussion"]

                key_takeaways = data.get("key_takeaways", [])
                if not isinstance(key_takeaways, list) or not key_takeaways:
                    key_takeaways = [s.get("text", "") for s in non_empty[:3] if s.get("text")] or ["Meeting notes reviewed"]

                summary = {
                    "executive_summary": exec_summary,
                    "key_topics": [str(t) if str(t).startswith("#") else f"#{t}" for t in key_topics],
                    "key_takeaways": [str(t) for t in key_takeaways],
                }

                raw_decisions = data.get("decisions", []) or []
                decisions = []
                if isinstance(raw_decisions, list):
                    for dec in raw_decisions:
                        if isinstance(dec, dict) and dec.get("decision_text"):
                            decisions.append({
                                "decision_text": str(dec["decision_text"]),
                                "speaker": str(dec.get("speaker") or "Participant"),
                                "timestamp_seconds": float(dec.get("timestamp_seconds") or 0.0),
                                "context_snippet": str(dec.get("context_snippet") or ""),
                            })

                raw_actions = data.get("action_items", []) or []
                action_items = []
                if isinstance(raw_actions, list):
                    for act in raw_actions:
                        if isinstance(act, dict) and act.get("task"):
                            action_items.append({
                                "task": str(act["task"]),
                                "owner": str(act.get("owner") or "Unassigned"),
                                "deadline": str(act.get("deadline")) if act.get("deadline") else None,
                                "timestamp_seconds": float(act.get("timestamp_seconds") or 0.0),
                                "status": str(act.get("status") or "Pending"),
                            })

                raw_formatted = data.get("formatted_transcript", []) or []
                formatted_segments = []
                if isinstance(raw_formatted, list) and raw_formatted:
                    for idx, fseg in enumerate(raw_formatted):
                        if isinstance(fseg, dict) and fseg.get("text"):
                            orig = non_empty[idx] if idx < len(non_empty) else {}
                            formatted_segments.append({
                                "sequence_order": int(fseg.get("sequence_order", idx)),
                                "speaker": str(fseg.get("speaker") or orig.get("speaker") or f"Speaker {(idx % 2) + 1}"),
                                "text": str(fseg["text"]).strip(),
                                "start_time": float(fseg.get("start_time") if fseg.get("start_time") is not None else orig.get("start_time", 0.0)),
                                "end_time": float(fseg.get("end_time") if fseg.get("end_time") is not None else orig.get("end_time", 0.0)),
                            })

                if not formatted_segments:
                    formatted_segments = non_empty

                logger.info(
                    "Successfully extracted intelligence & diarized %d speaker turns via local LLM!",
                    len(formatted_segments),
                )
                return summary, decisions, action_items, formatted_segments

            except Exception as exc:
                logger.warning("Local LLM extraction failed: %s. Falling back to Groq...", exc)

        # Fallback to Groq API or dynamic fallback
        try:
            from app.services.groq_service import groq_service
            return groq_service.extract_intelligence(transcript_segments, file_name)
        except Exception:
            return self._dynamic_fallback_intelligence(transcript_segments, file_name)

    def _synthesize_summary_from_segments(self, non_empty: List[Dict[str, Any]], file_name: str) -> str:
        if not non_empty:
            return f"The meeting for {file_name} was conducted."
        speakers = sorted(list({s.get("speaker", "Speaker") for s in non_empty}))
        dialogue_preview = " ".join(s.get("text", "") for s in non_empty[:5])
        return (
            f"The meeting regarding {file_name} involved {', '.join(speakers)}. "
            f"Key discussion highlights included: {dialogue_preview}"
        )

    def _dynamic_fallback_intelligence(
        self, transcript_segments: List[Dict[str, Any]], file_name: str
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        non_empty = [s for s in transcript_segments if s.get("text")]
        if not non_empty:
            exec_summary = f"Meeting recording processed for {file_name}."
            topics = ["#general-sync"]
            takeaways = ["Meeting audio recorded and archived."]
            decisions = []
            action_items = []
        else:
            speakers = sorted(list({s.get("speaker", "Speaker") for s in non_empty}))
            first_text = non_empty[0].get("text", "")
            last_text = non_empty[-1].get("text", "") if len(non_empty) > 1 else ""
            exec_summary = (
                f"Meeting review for {file_name} with participants ({', '.join(speakers)}). "
                f"The discussion opened with: \"{first_text}\""
            )
            if last_text and last_text != first_text:
                exec_summary += f" and concluded with: \"{last_text}\""

            topics = [f"#{sp.replace(' ', '').lower()}" for sp in speakers] + ["#meeting-notes"]
            takeaways = [s.get("text", "") for s in non_empty[:4] if s.get("text")]

            decisions = []
            action_items = []
            for s in non_empty:
                txt = s.get("text", "").lower()
                if any(w in txt for w in ["decide", "agree", "approved", "confirm", "let's", "launch", "plan"]):
                    decisions.append({
                        "decision_text": s.get("text", ""),
                        "speaker": s.get("speaker", "Participant"),
                        "timestamp_seconds": float(s.get("start_time", 0.0)),
                        "context_snippet": s.get("text", ""),
                    })
                if any(w in txt for w in ["will", "task", "handle", "action", "assigned", "responsible", "tomorrow", "deadline"]):
                    action_items.append({
                        "task": s.get("text", ""),
                        "owner": s.get("speaker", "Unassigned"),
                        "deadline": "Pending Review",
                        "timestamp_seconds": float(s.get("start_time", 0.0)),
                        "status": "Pending",
                    })

        summary = {
            "executive_summary": exec_summary,
            "key_topics": topics[:5],
            "key_takeaways": takeaways[:5] or ["Discussion points documented."],
        }
        return summary, decisions[:5], action_items[:5], non_empty

    def ask_meeting_question(
        self,
        transcript_segments: List[Dict[str, Any]],
        summary_text: str,
        question: str,
        file_name: str,
    ) -> Dict[str, Any]:
        """
        Answer a user question based on transcript and summary using local LLM.
        """
        llm = self._get_llm()
        transcript_text = "\n".join(
            f"[{seg.get('start_time', 0.0)}s - {seg.get('speaker', 'Speaker')}]: {seg.get('text', '')}"
            for seg in transcript_segments
            if seg.get("text")
        )

        if not transcript_text or os.environ.get("TESTING") == "1":
            return self._default_answer(file_name, question)

        if llm:
            try:
                logger.info("Answering question via local LLM (%s)...", self._model_path.name if self._model_path else "local")
                system_prompt = (
                    "You are an expert AI Meeting Copilot. Answer user questions accurately and helpfully using the provided meeting transcript and executive summary.\n"
                    "Cite specific timestamps and speakers whenever relevant.\n"
                    "Return ONLY a JSON object with this exact schema:\n"
                    "{\n"
                    '  "answer": "Comprehensive answer formatted in Markdown with bullets or paragraphs as needed.",\n'
                    '  "citations": [\n'
                    '    {"speaker": "Speaker 1", "timestamp_seconds": 15.0, "snippet": "Relevant quote"}\n'
                    '  ]\n'
                    "}"
                )
                user_prompt = (
                    f"Meeting File: {file_name}\n"
                    f"Summary: {summary_text}\n\n"
                    f"Transcript:\n{transcript_text}\n\n"
                    f"User Question: {question}"
                )

                response = llm.create_chat_completion(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=600,
                )

                content = response["choices"][0]["message"]["content"] or "{}"
                data = self._parse_llm_json(content)
                answer = str(data.get("answer") or "").strip()
                if answer:
                    raw_citations = data.get("citations", []) or []
                    citations = []
                    if isinstance(raw_citations, list):
                        for c in raw_citations:
                            if isinstance(c, dict):
                                citations.append({
                                    "speaker": str(c.get("speaker") or "Participant"),
                                    "timestamp_seconds": float(c.get("timestamp_seconds") or 0.0),
                                    "snippet": str(c.get("snippet") or ""),
                                })
                    return {"answer": answer, "citations": citations}

            except Exception as exc:
                logger.warning("Local LLM question answering failed: %s. Falling back to Groq...", exc)

        # Fallback to Groq API
        try:
            from app.services.groq_service import groq_service
            return groq_service.ask_meeting_question(transcript_segments, summary_text, question, file_name)
        except Exception:
            return self._default_answer(file_name, question)

    def _default_answer(self, file_name: str, question: str) -> Dict[str, Any]:
        return {
            "answer": f"Based on the meeting transcript for **{file_name}**, the discussion addressed '{question}' and related operational points.",
            "citations": [],
        }


local_llm_service = LocalLLMService()
