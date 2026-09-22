/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

export default function TaskProgressUpdateModal({
  isOpen,
  onClose,
  task,
  project,
  sprints = [],
  employeeProfile,
  targetStatus = "REVIEW",
  onConfirm,
  isSubmitting = false,
}) {
  const [comments, setComments] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [submittedAt, setSubmittedAt] = useState("");
  const [selectedPreviewImg, setSelectedPreviewImg] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef(null);

  // Process, optimize, and convert uploaded image files to base64 Data URLs
  const processImageFiles = useCallback((files) => {
    const fileList = Array.from(files);
    fileList.forEach((file) => {
      if (!file.type.startsWith("image/")) {
        setErrorMsg("Please upload image files only (PNG, JPG, WebP, GIF).");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg("Image size exceeds 10MB limit.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const rawDataUrl = e.target.result;
        // Compress and optimize image to keep payload small (<300KB) and prevent transmission failure
        const img = new window.Image();
        img.onload = () => {
          try {
            const maxDim = 1600;
            let width = img.width;
            let height = img.height;

            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            // Export as optimized JPEG
            const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
            const approxKb = Math.round((optimizedDataUrl.length * 0.75) / 1024);

            setAttachments((prev) => [
              ...prev,
              {
                id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                name: file.name || `Screenshot-${new Date().toLocaleTimeString().replace(/:/g, "-")}.jpg`,
                size: `${approxKb} KB`,
                dataUrl: optimizedDataUrl,
                type: "image/jpeg",
              },
            ]);
          } catch (canvasErr) {
            console.warn("Canvas compression fallback:", canvasErr);
            setAttachments((prev) => [
              ...prev,
              {
                id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                name: file.name || `Screenshot-${new Date().toLocaleTimeString().replace(/:/g, "-")}.png`,
                size: `${(file.size / 1024).toFixed(1)} KB`,
                dataUrl: rawDataUrl,
                type: file.type,
              },
            ]);
          }
        };
        img.onerror = () => {
          setAttachments((prev) => [
            ...prev,
            {
              id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              name: file.name || `Screenshot-${new Date().toLocaleTimeString().replace(/:/g, "-")}.png`,
              size: `${(file.size / 1024).toFixed(1)} KB`,
              dataUrl: rawDataUrl,
              type: file.type,
            },
          ]);
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // Initialize form state and timestamp on open
  useEffect(() => {
    if (task && isOpen) {
      setComments("");
      setAttachments([]);
      setErrorMsg("");
      const now = new Date();
      setSubmittedAt(
        now.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
  }, [task, isOpen]);

  // Handle Clipboard Paste for direct screenshot pasting (Ctrl+V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processImageFiles([file]);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen, processImageFiles]);

  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        if (selectedPreviewImg) {
          setSelectedPreviewImg(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose, selectedPreviewImg]);

  if (!isOpen || !task) return null;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processImageFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!comments.trim()) {
      setErrorMsg("Please enter comments describing your deliverable for your Team Lead.");
      return;
    }

    try {
      await onConfirm({
        taskId: task.id,
        newStatus: targetStatus || "REVIEW",
        progress: 85,
        comments: comments.trim(),
        review_comments: comments.trim(),
        review_attachments: attachments.map((a) => ({
          name: a.name,
          size: a.size,
          dataUrl: a.dataUrl,
        })),
        review_submitted_at: new Date().toISOString(),
      });
      onClose();
    } catch (err) {
      console.error("Progress update error:", err);
      setErrorMsg(err.message || "Failed to submit review. Please try again.");
    }
  };

  const activeSprint =
    sprints.find((s) => s.id === task.sprint_id) || task.sprint || null;
  const sprintName = activeSprint ? activeSprint.name : "Backlog (Unscheduled)";

  const submitterName =
    employeeProfile?.full_name ||
    task.assignee?.full_name ||
    task.planned_assignee?.full_name ||
    "Assigned Employee";

  const teamLeadName =
    project?.teamLead?.full_name ||
    project?.team_lead_name ||
    (project?.team_lead_id ? "Assigned Team Lead" : "Project Manager / Team Lead");

  const teamLeadSuggestion = React.useMemo(() => {
    const candidates = [
      task?.comments,
      task?.last_status_comment,
      task?.review_comments,
    ].filter((c) => typeof c === "string" && c.trim().length > 0);

    const prefixes = [
      "[Team Lead Suggestions]:",
      "[Team Lead Revision Feedback]:",
      "[Scope Revision Instructions]:",
      "[QA Defect / Bug Report]:",
      "[Team Lead Review]:",
    ];

    for (const raw of candidates) {
      for (const prefix of prefixes) {
        if (raw.includes(prefix)) {
          const text = raw.substring(raw.indexOf(prefix) + prefix.length).trim();
          const cleaned = text.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
          if (cleaned) {
            return {
              text: cleaned,
              leadName: project?.teamLead?.full_name || project?.team_lead_name || "Team Lead",
              timestamp: task?.updated_at || null,
            };
          }
        }
      }
    }
    return null;
  }, [task, project]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
        {/* Top Header matching exact Create Sprint format */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900">Review:</span>
            <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
              Task Deliverable
            </span>
          </div>

          {/* Red square close button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3.5 max-h-[85vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Team Lead Review Suggestions Reminder (if submitting after feedback) */}
          {teamLeadSuggestion && (
            <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-300/80 shadow-2xs space-y-1.5 animate-fadeIn">
              <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                <span className="flex items-center gap-1.5">
                  <span>💬</span>
                  <span>Previous Review Suggestions from {teamLeadSuggestion.leadName}:</span>
                </span>
                <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                  Address before submit
                </span>
              </div>
              <p className="text-xs text-slate-800 bg-white/90 p-2.5 rounded-lg border border-amber-200 whitespace-pre-wrap leading-relaxed shadow-2xs">
                {teamLeadSuggestion.text}
              </p>
            </div>
          )}

          {/* Row: Task Name with red underline indicator */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">
                Task Name
              </span>
            </label>
            <div className="flex-1">
              <input
                type="text"
                readOnly
                value={task.title || ""}
                className="w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 font-medium cursor-default"
              />
            </div>
          </div>

          {/* Row: Employee Name */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              Employee Name
            </label>
            <div className="flex-1">
              <input
                type="text"
                readOnly
                value={submitterName}
                className="w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 cursor-default"
              />
            </div>
          </div>

          {/* Row: Assigned Team Lead (Review Recipient) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              Reviewer (TL)
            </label>
            <div className="flex-1">
              <input
                type="text"
                readOnly
                value={teamLeadName}
                className="w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-blue-700 font-medium cursor-default"
              />
            </div>
          </div>

          {/* Row: Sprint */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              Sprint
            </label>
            <div className="flex-1">
              <input
                type="text"
                readOnly
                value={sprintName}
                className="w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 cursor-default"
              />
            </div>
          </div>

          {/* Row: Task Description */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              Description
            </label>
            <div className="flex-1">
              <textarea
                rows={2}
                readOnly
                value={task.description || "No task description provided."}
                className="w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-700 resize-none cursor-default"
              />
            </div>
          </div>

          {/* Section Divider: Default Section */}
          <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-2">
            Default Section
          </div>

          {/* Row: Submitted Date & Time */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              Submitted At
            </label>
            <div className="flex-1">
              <input
                type="text"
                readOnly
                value={submittedAt}
                className="w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 font-mono cursor-default"
              />
            </div>
          </div>

          {/* Row: Employee Comments */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              <span className="border-b-2 border-rose-500 pb-0.5">
                Comments
              </span>
            </label>
            <div className="flex-1">
              <textarea
                rows={3}
                required
                autoFocus
                placeholder="Describe what has been completed, test verification, or deliverable notes…"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Row: Screenshot Attachments / Proof of Work */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              Attachments
            </label>
            <div className="flex-1 space-y-2">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded p-3 text-center cursor-pointer transition ${
                  isDraggingOver
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 hover:border-blue-400 bg-slate-50/50"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <p className="text-xs text-slate-600">
                  <span className="font-semibold text-blue-600">Click to upload</span> or drag &amp; drop screenshots, or press <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-300 rounded shadow-2xs font-bold">Ctrl+V</kbd> to paste
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, WebP up to 5MB</p>
              </div>

              {/* Uploaded Thumbnails list */}
              {attachments.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                  {attachments.map((att, idx) => (
                    <div
                      key={att.id ? `prog-att-${att.id}` : `prog-att-idx-${idx}`}
                      className="relative group rounded border border-slate-200 p-1 bg-white overflow-hidden flex flex-col"
                    >
                      <div
                        className="h-16 w-full rounded overflow-hidden bg-slate-100 flex items-center justify-center relative cursor-pointer"
                        onClick={() => setSelectedPreviewImg(att.dataUrl)}
                      >
                        <img
                          src={att.dataUrl}
                          alt={att.name}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold">
                          🔍 View
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 text-[10px]">
                        <span className="truncate max-w-[70px] text-slate-700" title={att.name}>
                          {att.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="text-rose-500 hover:text-rose-700 font-bold px-1 cursor-pointer"
                          title="Remove attachment"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Action Buttons matching exact Create Sprint format */}
          <div className="pt-4 pb-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !comments.trim()}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isSubmitting ? "Submitting…" : "Submit Review"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Full-size Image Preview Lightbox */}
      {selectedPreviewImg && (
        <div
          onClick={() => setSelectedPreviewImg(null)}
          className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-transparent rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center">
            <img
              src={selectedPreviewImg}
              alt="Screenshot Preview"
              className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setSelectedPreviewImg(null)}
              className="mt-3 px-4 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition cursor-pointer backdrop-blur-md"
            >
              ✕ Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
