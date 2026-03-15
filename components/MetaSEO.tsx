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

    // OpenGraph Image Handling
    const getAbsoluteUrl = (url?: string) => {
      if (!url) return null;
      if (url.startsWith('data:')) return null; // WhatsApp/Meta ignore base64
      if (url.startsWith('http')) return url;
      const clean = url.startsWith('/') ? url.slice(1) : url;
      return `https://www.amigoracing.com.br/${clean}`;
    };

    const absoluteImage = getAbsoluteUrl(ogImage);
    console.log("[MetaSEO] ogImage:", ogImage);
    console.log("[MetaSEO] absoluteImage:", absoluteImage);

    // Update OpenGraph Image
    if (absoluteImage) {
      let ogImageTag = document.querySelector('meta[property="og:image"]');
      if (!ogImageTag) {
        ogImageTag = document.createElement("meta");
        ogImageTag.setAttribute("property", "og:image");
        document.head.appendChild(ogImageTag);
      }
      ogImageTag.setAttribute("content", absoluteImage);
    }

    // Update OpenGraph Image Dimensions
    if (ogImage) {
      let ogWidthTag = document.querySelector('meta[property="og:image:width"]');
      if (!ogWidthTag) {
        ogWidthTag = document.createElement("meta");
        ogWidthTag.setAttribute("property", "og:image:width");
        document.head.appendChild(ogWidthTag);
      }
      ogWidthTag.setAttribute("content", "1200");

      let ogHeightTag = document.querySelector('meta[property="og:image:height"]');
      if (!ogHeightTag) {
        ogHeightTag = document.createElement("meta");
        ogHeightTag.setAttribute("property", "og:image:height");
        document.head.appendChild(ogHeightTag);
      }
      ogHeightTag.setAttribute("content", "630");
    }

    // Update OpenGraph Image Type
    if (ogImage) {
      let ogTypeImgTag = document.querySelector('meta[property="og:image:type"]');
      if (!ogTypeImgTag) {
        ogTypeImgTag = document.createElement("meta");
        ogTypeImgTag.setAttribute("property", "og:image:type");
        document.head.appendChild(ogTypeImgTag);
      }
      
      let type = "image/png";
      if (ogImage.toLowerCase().endsWith(".jpg") || ogImage.toLowerCase().endsWith(".jpeg")) {
        type = "image/jpeg";
      } else if (ogImage.toLowerCase().endsWith(".webp")) {
        type = "image/webp";
      }
      ogTypeImgTag.setAttribute("content", type);
    }

    // Update Twitter Tags
    if (absoluteImage) {
      let twitterCardTag = document.querySelector('meta[name="twitter:card"]');
      if (!twitterCardTag) {
        twitterCardTag = document.createElement("meta");
        twitterCardTag.setAttribute("name", "twitter:card");
        document.head.appendChild(twitterCardTag);
      }
      twitterCardTag.setAttribute("content", "summary_large_image");

      let twitterImageTag = document.querySelector('meta[name="twitter:image"]');
      if (!twitterImageTag) {
        twitterImageTag = document.createElement("meta");
        twitterImageTag.setAttribute("name", "twitter:image");
        document.head.appendChild(twitterImageTag);
      }
      twitterImageTag.setAttribute("content", absoluteImage);
    }
  }, [title, description, ogTitle, ogDescription, ogType, ogImage]);

  return null;
}
