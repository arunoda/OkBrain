"use client";

import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import styles from "./ImageGallery.module.css";

interface ImageItem {
  src: string;
  title: string;
  link: string;
}

type Segment =
  | { type: 'text'; content: string }
  | { type: 'images'; images: ImageItem[]; loading: boolean };

const IMAGE_TAG_REGEX = /<image\s+src="([^"]*?)"\s+title="([^"]*?)"\s+link="([^"]*?)"\s*\/?\s*>/g;

function parseImageTags(block: string): ImageItem[] {
  const images: ImageItem[] = [];
  let match;
  const regex = new RegExp(IMAGE_TAG_REGEX.source, 'g');
  while ((match = regex.exec(block)) !== null) {
    images.push({ src: match[1], title: match[2], link: match[3] });
  }
  return images;
}

/**
 * Parse <images> blocks from message content.
 * Incomplete blocks (still streaming) are emitted with loading=true and whatever images parsed so far.
 */
export function parseImageBlocks(content: string): Segment[] {
  const segments: Segment[] = [];
  // Match complete blocks first
  const completeRegex = /<images>([\s\S]*?)<\/images>/g;
  let lastIndex = 0;
  let match;

  while ((match = completeRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: 'text', content: text });
    }
    const images = parseImageTags(match[1]);
    if (images.length > 0) {
      segments.push({ type: 'images', images, loading: false });
    }
    lastIndex = match.index + match[0].length;
  }

  // Check for an incomplete <images> block at the end (streaming)
  const remaining = content.slice(lastIndex);
  const incompleteIdx = remaining.indexOf('<images>');

  if (incompleteIdx !== -1) {
    // Text before the incomplete block
    const textBefore = remaining.slice(0, incompleteIdx).trim();
    if (textBefore) segments.push({ type: 'text', content: textBefore });

    // Parse any complete <image> tags inside the incomplete block
    const partialBlock = remaining.slice(incompleteIdx + '<images>'.length);
    const images = parseImageTags(partialBlock);
    // Always show the gallery container when <images> is opened (even with 0 images yet)
    segments.push({ type: 'images', images, loading: true });
  } else {
    // No incomplete block - just trailing text
    const text = remaining.trim();
    if (text) segments.push({ type: 'text', content: text });
  }

  // If nothing was parsed, return full content as text
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: 'text', content });
  }

  return segments;
}

export default function ImageGallery({ images, loading }: { images: ImageItem[]; loading?: boolean }) {
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);

  return (
    <>
      <div className={styles.gallery}>
        {images.map((img, i) => (
          <button
            key={i}
            className={styles.item}
            onClick={() => setSelectedImage(img)}
          >
            <img src={img.src} alt={img.title} className={styles.image} />
            <span className={styles.title}>{img.title}</span>
          </button>
        ))}
        {loading && (
          <div className={styles.placeholder}>
            <div className={styles.placeholderPulse} />
          </div>
        )}
      </div>

      {selectedImage && (
        <div className={styles.overlay} onClick={() => setSelectedImage(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>{selectedImage.title}</span>
              <div className={styles.modalActions}>
                <a
                  href={selectedImage.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceLink}
                >
                  <ExternalLink size={14} />
                  <span>Source</span>
                </a>
                <button
                  className={styles.closeButton}
                  onClick={() => setSelectedImage(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <img
              src={selectedImage.src}
              alt={selectedImage.title}
              className={styles.modalImage}
            />
          </div>
        </div>
      )}
    </>
  );
}
