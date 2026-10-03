"use client";

import React, { useState } from "react";

/**
 * TaskDeliverablesViewer Sub-Component
 * Clean, professional view for inspect/submit deliverable notes and proof attachments.
 * Completely aligned with the HRMS product theme.
 */
export default function TaskDeliverablesViewer({
  task,
  submitterName,
  reviewerData,
  deliverableComments,
  setDeliverableComments,
  attachments = [],
  onRemoveAttachment,
  onUploadFiles,
  uploadingCount = 0,
  isReadOnly = false,
  isDraggingOver = false,
  setIsDraggingOver,
  fileInputRef,
}) {
  const [activePreviewImage, setActivePreviewImage] = useState(null);

  const handleDrop = (e) => {
    e.preventDefault();
    if (setIsDraggingOver) setIsDraggingOver(false);
    if (isReadOnly) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && onUploadFiles) {
      onUploadFiles(files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (setIsDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (setIsDraggingOver) setIsDraggingOver(false);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Submitter & Reviewer Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Submitter Info Card */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Submitted By
          </span>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1f6fb2] dark:bg-blue-950 dark:text-sky-300 font-bold flex items-center justify-center text-xs border border-blue-100 dark:border-blue-900">
              {submitterName?.slice(0, 2)?.toUpperCase() || "DV"}
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block truncate">
                {submitterName || "Assigned Developer"}
              </span>
              {task?.submitted_at ? (
                <span className="text-[10px] text-slate-400 block font-mono">
                  {new Date(task.submitted_at).toLocaleString()}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 block">In Progress</span>
              )}
            </div>
          </div>
        </div>

        {/* Reviewer Decision Card */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Review Status
          </span>
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs border ${
                reviewerData?.isApproved
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900"
                  : reviewerData?.isPending
                  ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-900"
                  : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}
            >
              {reviewerData?.isApproved ? "✓" : reviewerData?.isPending ? "⏳" : "—"}
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block truncate">
                {reviewerData?.reviewerName || "Pending Supervisor Review"}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                {reviewerData?.decision || (reviewerData?.isPending ? "Awaiting verification" : "Not yet submitted")}
              </span>
            </div>
          </div>
          {reviewerData?.reviewedAt && (
            <span className="text-[10px] text-slate-400 block font-mono">
              {new Date(reviewerData.reviewedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Deliverable Notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
          Deliverable Summary &amp; Notes
        </label>
        {isReadOnly ? (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs min-h-[60px] whitespace-pre-wrap font-medium">
            {deliverableComments || "No deliverable notes provided yet by the assigned employee."}
          </div>
        ) : (
          <textarea
            rows={3}
            value={deliverableComments}
            onChange={(e) => setDeliverableComments?.(e.target.value)}
            placeholder="Describe the completed work, test verification outcomes, or links..."
            className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl p-3 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none shadow-2xs transition resize-y font-medium"
          />
        )}
      </div>

      {/* Attachments & Proofs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
            Deliverable Proofs &amp; Attachments ({attachments.length})
          </label>
          {!isReadOnly && fileInputRef && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold text-[#1f6fb2] hover:underline cursor-pointer"
            >
              + Upload File
            </button>
          )}
        </div>

        {/* Hidden File Input */}
        {!isReadOnly && fileInputRef && onUploadFiles && (
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onUploadFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
        )}

        {/* Attachments Grid */}
        {attachments.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {attachments.map((att, idx) => {
              const isImg = att.type?.startsWith("image/") || att.url?.match(/\.(png|jpg|jpeg|webp|gif)/i) || !att.type;
              return (
                <div
                  key={att.id || idx}
                  className="group relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 hover:border-slate-300 transition-all flex flex-col shadow-2xs"
                >
                  {/* Thumbnail */}
                  <div
                    onClick={() => {
                      if (att.url && !att.isUploading) setActivePreviewImage(att);
                    }}
                    className="aspect-video w-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer overflow-hidden relative"
                  >
                    {isImg && att.url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={att.url}
                        alt={att.name || "Proof"}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-slate-400 p-2 text-center">
                        <svg className="w-6 h-6 text-[#1f6fb2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-[10px] font-medium truncate max-w-[100px]">{att.name}</span>
                      </div>
                    )}

                    {att.isUploading && (
                      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center text-white text-[10px] font-semibold gap-1.5">
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Uploading...
                      </div>
                    )}
                  </div>

                  {/* Attachment Meta */}
                  <div className="p-2 flex items-center justify-between gap-1 text-[11px] bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate" title={att.name}>
                      {att.name || `Proof-${idx + 1}.png`}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                      {att.size || ""}
                    </span>
                  </div>

                  {/* Remove Button */}
                  {!isReadOnly && onRemoveAttachment && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveAttachment(att.id || idx);
                      }}
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-slate-900/70 hover:bg-rose-600 text-white text-[10px] flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                      title="Remove attachment"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : isReadOnly ? (
          <div className="py-6 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400 font-medium">
            No deliverable proofs or attachments submitted yet.
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef?.current?.click()}
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
                Click or drag and drop files here
              </p>
              <p className="text-[10px] text-slate-400">
                Images (PNG, JPG, WebP) or Documents (PDF) up to 15MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {activePreviewImage && (
        <div
          onClick={() => setActivePreviewImage(null)}
          className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-800"
          >
            <div className="p-3 bg-slate-950 flex items-center justify-between text-white text-xs border-b border-slate-800">
              <span className="font-semibold truncate max-w-md">{activePreviewImage.name || "Preview"}</span>
              <div className="flex items-center gap-3">
                {activePreviewImage.url && (
                  <a
                    href={activePreviewImage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={activePreviewImage.name || "attachment"}
                    className="text-xs text-sky-400 hover:underline"
                  >
                    Download
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setActivePreviewImage(null)}
                  className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-2 flex items-center justify-center overflow-auto max-h-[80vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activePreviewImage.url}
                alt={activePreviewImage.name || "Preview"}
                className="max-h-[75vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
