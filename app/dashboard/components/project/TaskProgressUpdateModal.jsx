/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "@/lib/api/authFetch";

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
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef(null);

  // Upload screenshots to public bucket
  const processImageFiles = useCallback(
    async (files) => {
      const fileList = Array.from(files);
      for (const file of fileList) {
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
          setErrorMsg("Please upload image files (PNG, JPG, WebP) or PDF documents.");
          continue;
        }
        if (file.size > 15 * 1024 * 1024) {
          setErrorMsg("Attachment exceeds 15MB limit.");
          continue;
        }

        const tempId = `att-temp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const previewUrl = URL.createObjectURL(file);

        setAttachments((prev) => [
          ...prev,
          {
            id: tempId,
            name: file.name || `Proof-${Date.now()}.png`,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            url: previewUrl,
            type: file.type,
            isUploading: true,
          },
        ]);
        setUploadingCount((c) => c + 1);

        try {
          const formData = new FormData();
          formData.append("file", file);
          if (task?.id) formData.append("taskId", task.id);
          if (project?.id) formData.append("projectId", project.id);

          const res = await authFetch("/api/upload/task-attachment", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();
          if (res.ok && data.url) {
            setAttachments((prev) =>
              prev.map((att) =>
                att.id === tempId
                  ? {
                      id: data.id || tempId,
                      name: data.name || att.name,
                      size: data.size || att.size,
                      url: data.url,
                      type: data.type || att.type,
                      isUploading: false,
                    }
                  : att
              )
            );
          } else {
            setErrorMsg(data.message || "Failed to upload file.");
            setAttachments((prev) => prev.filter((att) => att.id !== tempId));
          }
        } catch (err) {
          console.error("Task attachment upload error:", err);
          setErrorMsg("Network error uploading attachment.");
          setAttachments((prev) => prev.filter((att) => att.id !== tempId));
        } finally {
          setUploadingCount((c) => Math.max(0, c - 1));
        }
      }
    },
    [task?.id, project?.id]
  );

  // Initialize form state
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

  // Handle Clipboard Paste (Ctrl+V)
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

  // ESC key listener
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

  if (!isOpen || !task || typeof document === "undefined") return null;

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
    if (uploadingCount > 0) {
      setErrorMsg("Please wait for attachments to finish uploading.");
      return;
    }

    if (!comments.trim()) {
      setErrorMsg("Please enter deliverable notes for your Team Lead.");
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
          id: a.id,
          name: a.name,
          size: a.size,
          url: a.url || a.dataUrl,
          type: a.type,
        })),
        review_submitted_at: new Date().toISOString(),
      });
      onClose();
    } catch (err) {
      console.error("Progress update error:", err);
      setErrorMsg(err.message || "Failed to submit review. Please try again.");
    }
  };

  const projectKey = project?.key || project?.name?.slice(0, 3)?.toUpperCase() || "HRM";
  const taskNumber = task?.task_number || task?.id?.slice(0, 5) || "01";
  const displayKey = `${projectKey}-${taskNumber}`;

  const activeSprint = sprints.find((s) => s.id === task.sprint_id) || task.sprint || null;
  const sprintName = activeSprint ? activeSprint.name : "Backlog";

  const submitterName =
    employeeProfile?.full_name ||
    task.assignee?.full_name ||
    task.planned_assignee?.full_name ||
    "Assigned Employee";

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn text-xs"
    >
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
        {/* Header Bar */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <span className="px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-blue-50 text-[#1f6fb2] dark:bg-blue-950 dark:text-sky-300 border border-blue-200 dark:border-blue-900 shadow-2xs shrink-0">
              {displayKey}
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
              Submit Deliverable for Review
            </span>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center text-sm transition cursor-pointer shrink-0"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(88vh-140px)]">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Task Info Summary Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {task.title}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-[#1f6fb2] border border-blue-200 dark:bg-blue-950 dark:text-sky-300 dark:border-blue-900">
                  {sprintName}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Assignee: <strong className="text-slate-700 dark:text-slate-200">{submitterName}</strong></span>
                <span>•</span>
                <span>Submitted: <strong className="text-slate-700 dark:text-slate-200">{submittedAt}</strong></span>
              </div>
            </div>

            {/* Deliverable Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Deliverable Summary &amp; Verification Notes
              </label>
              <textarea
                rows={3}
                required
                autoFocus
                placeholder="Describe what has been completed, test verification results, or relevant links..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl p-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none shadow-2xs transition resize-y font-medium"
              />
            </div>

            {/* Proofs & Attachments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Deliverable Proofs &amp; Attachments ({attachments.length})
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold text-[#1f6fb2] hover:underline cursor-pointer"
                >
                  + Upload File
                </button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                multiple
                className="hidden"
              />

              {attachments.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {attachments.map((att, idx) => (
                    <div
                      key={att.id || idx}
                      className="group relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 flex flex-col shadow-2xs"
                    >
                      <div
                        className="aspect-video w-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer overflow-hidden relative"
                        onClick={() => !att.isUploading && setSelectedPreviewImg(att.url)}
                      >
                        {att.url && (
                          <img
                            src={att.url}
                            alt={att.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        )}
                        {att.isUploading && (
                          <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center text-white text-[10px] font-semibold gap-1.5">
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Uploading...
                          </div>
                        )}
                      </div>
                      <div className="p-2 flex items-center justify-between gap-1 text-[11px] border-t border-slate-100 dark:border-slate-800">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate" title={att.name}>
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
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                    isDraggingOver
                      ? "border-[#1f6fb2] bg-blue-50/50 dark:bg-blue-950/20"
                      : "border-slate-300 dark:border-slate-700 hover:border-[#1f6fb2] bg-slate-50/40 dark:bg-slate-800/30"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <svg className="w-7 h-7 text-[#1f6fb2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Click, drag &amp; drop files, or press Ctrl+V to paste screenshot
                    </p>
                    <p className="text-[10px] text-slate-400">
                      PNG, JPG, WebP, or PDF up to 15MB
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Bar */}
          <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer shadow-2xs disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !comments.trim()}
              className="px-5 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting…</span>
                </>
              ) : (
                <span>Submit Deliverable for Review</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Lightbox Preview */}
      {selectedPreviewImg && (
        <div
          onClick={() => setSelectedPreviewImg(null)}
          className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center">
            <img
              src={selectedPreviewImg}
              alt="Screenshot Preview"
              className="max-h-[85vh] max-w-full object-contain rounded-xl"
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

  return createPortal(modalContent, document.body);
}
