"use client";

import { Mic, SendHorizonal, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export default function RuixenQueryBox({
  onSubmit,
  placeholder = "Ask anything...",
}: {
  onSubmit?: (value: string) => void;
  placeholder?: string;
} = {}) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 56,
    maxHeight: 220,
  });

  const [inputValue, setInputValue] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSubmit?.(inputValue.trim());
    setInputValue("");
    adjustHeight(true);
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;
    console.log("Uploaded files:", files);
  };

  return (
    <div className="w-full px-4 py-6">
      <div
        className="relative max-w-2xl mx-auto rounded-2xl border border-black/10 shadow-sm overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(120% 140% at 0% 0%, #2a2722 0%, #14130f 55%, #0a0a08 100%)",
        }}
      >
        <Textarea
          id="ai-textarea"
          ref={textareaRef}
          placeholder={placeholder}
          className={cn(
            "w-full resize-none border-none bg-transparent",
            "text-base text-white placeholder:text-gray-400",
            "px-5 py-4 pr-24 rounded-2xl leading-[1.4]",
            "transition-all focus-visible:ring-0 focus-visible:ring-offset-0"
          )}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        {/* Icon Buttons */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <button
            type="button"
            className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
          >
            <Mic className="w-4 h-4" />
          </button>

          {/* File Upload Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
              >
                <Upload className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-4">
              <p className="text-sm mb-2">Upload files:</p>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={(e) => handleFileUpload(e.target.files)}
                className="w-full border border-gray-300 rounded p-1"
              />
              <Button
                className="mt-2 w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose Files
              </Button>
            </PopoverContent>
          </Popover>

          <button
            type="button"
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className={cn(
              "p-2 rounded-full transition-colors",
              inputValue.trim()
                ? "bg-white text-black"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            )}
          >
            <SendHorizonal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
