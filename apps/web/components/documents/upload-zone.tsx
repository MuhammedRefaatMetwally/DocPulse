"use client";

import { useCallback, useState } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { Progress } from "@/components/ui/progress";
import { UploadCloud } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { AxiosError } from "axios";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

interface UploadZoneProps {
  workspaceId: string;
  onUploadComplete: () => void;
}

export function UploadZone({ workspaceId, onUploadComplete }: UploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const acceptedFileTypes: Accept = {
    "application/pdf": [".pdf"],
    "text/plain": [".txt"],
  };
  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // Show rejection reasons
      for (const rejection of rejectedFiles) {
        toast.error(
          `${rejection.file.name}: ${rejection.errors[0]?.message ?? "Invalid file"}`,
        );
      }

      if (acceptedFiles.length === 0) return;

      for (const file of acceptedFiles) {
        setFileName(file.name);
        setUploading(true);
        setProgress(0);

        const formData = new FormData();
        formData.append("file", file);

        try {
          await api.post(
            `/workspaces/${workspaceId}/documents/upload`,
            formData,
            {
              headers: { "Content-Type": "multipart/form-data" },
              onUploadProgress: (e) => {
                const pct = Math.round((e.loaded * 100) / (e.total ?? 1));
                setProgress(pct);
              },
            },
          );
          toast.success(`${file.name} uploaded — processing started`);
          onUploadComplete();
        } catch (err) {
          const error = err as AxiosError<{ message: string }>;
          toast.error(
            `${file.name}: ${error.response?.data?.message ?? "Upload failed"}`,
          );
        }
      }

      setUploading(false);
      setProgress(0);
    },
    [workspaceId, onUploadComplete],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    maxSize: MAX_SIZE,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
        ${uploading ? "pointer-events-none opacity-70" : ""}`}
    >
      <input {...getInputProps()} />

      {uploading ? (
        <div className="space-y-3 max-w-sm mx-auto">
          <p className="text-sm font-medium truncate">{fileName}</p>
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground">Uploading {progress}%</p>
        </div>
      ) : (
        <div className="space-y-2">
          <UploadCloud className="mx-auto text-muted-foreground" size={32} />
          <p className="font-medium">
            {isDragActive ? "Drop file here" : "Drag & drop or click to upload"}
          </p>
          <p className="text-xs text-muted-foreground">
            PDF or TXT, up to 25MB
          </p>
        </div>
      )}
    </div>
  );
}
