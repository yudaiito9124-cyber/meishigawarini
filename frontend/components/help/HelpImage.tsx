"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";
import { X, Maximize2 } from "lucide-react";

interface HelpImageProps {
  src: string;
  alt?: string;
}

const renderTextWithLinks = (text: string) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 text-blue-500 hover:underline underline-offset-4 font-medium break-all"
        >
          <ExternalLink className="inline-block h-4 w-4 justify-center items-center" />  {part}
        </a>
      );
    }
    return part;
  });
};

export function HelpImage({ src, alt }: HelpImageProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="block mb-10 mt-5">
      <span className="block overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md">
        {alt && (
          <span className="block px-4 py-2 border-b bg-muted/30 text-sm text-primary font-medium leading-relaxed">
            {renderTextWithLinks(alt)}
          </span>
        )}

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <button className="group relative block w-full aspect-video bg-muted/10 cursor-zoom-in text-left">
              <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 bg-black/5">
                <div className="rounded-full bg-white/90 p-2 shadow-lg">
                  <Maximize2 className="h-5 w-5 text-gray-700" />
                </div>
              </div>
              <img
                src={src}
                alt={alt || ''}
                className="h-full w-full object-contain block"
                loading="lazy"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-transparent shadow-none flex items-center justify-center">
            <DialogTitle className="sr-only">Image Preview</DialogTitle>
            <DialogDescription className="sr-only">Lightbox view of: {alt || 'Help content image'}</DialogDescription>
            <div className="relative w-full h-full flex flex-col items-center justify-center">
              <img
                src={src}
                alt={alt || ''}
                className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain bg-white"
              />
              {alt && (
                <div className="mt-4 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-white text-sm">
                  {alt}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </span>
    </span>
  );
}
