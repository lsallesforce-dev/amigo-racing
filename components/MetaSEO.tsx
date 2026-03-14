import { useEffect } from "react";

interface MetaSEOProps {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  ogImage?: string;
}

export default function MetaSEO({
  title,
  description,
  ogTitle,
  ogDescription,
  ogType = "website",
  ogImage,
}: MetaSEOProps) {
  useEffect(() => {
    // Update Document Title
    if (title) {
      document.title = `${title} | Amigo Racing`;
    }

    // Update Meta Description
    if (description) {
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement("meta");
        metaDescription.setAttribute("name", "description");
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute("content", description);
    }

    // Update OpenGraph Title
    if (ogTitle || title) {
      let ogTitleTag = document.querySelector('meta[property="og:title"]');
      if (!ogTitleTag) {
        ogTitleTag = document.createElement("meta");
        ogTitleTag.setAttribute("property", "og:title");
        document.head.appendChild(ogTitleTag);
      }
      ogTitleTag.setAttribute("content", ogTitle || title || "");
    }

    // Update OpenGraph Description
    if (ogDescription || description) {
      let ogDescTag = document.querySelector('meta[property="og:description"]');
      if (!ogDescTag) {
        ogDescTag = document.createElement("meta");
        ogDescTag.setAttribute("property", "og:description");
        document.head.appendChild(ogDescTag);
      }
      ogDescTag.setAttribute("content", ogDescription || description || "");
    }

    // Update OpenGraph Type
    if (ogType) {
      let ogTypeTag = document.querySelector('meta[property="og:type"]');
      if (!ogTypeTag) {
        ogTypeTag = document.createElement("meta");
        ogTypeTag.setAttribute("property", "og:type");
        document.head.appendChild(ogTypeTag);
      }
      ogTypeTag.setAttribute("content", ogType);
    }

    // Update OpenGraph Image
    if (ogImage) {
      let ogImageTag = document.querySelector('meta[property="og:image"]');
      if (!ogImageTag) {
        ogImageTag = document.createElement("meta");
        ogImageTag.setAttribute("property", "og:image");
        document.head.appendChild(ogImageTag);
      }
      ogImageTag.setAttribute("content", ogImage);
    }
  }, [title, description, ogTitle, ogDescription, ogType, ogImage]);

  return null;
}
