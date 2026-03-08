import { Download } from 'lucide-react';

export interface EventDocument {
  name: string;
  url: string;
  type: string;
}

interface EventDocumentsViewerProps {
  documents?: EventDocument[];
}

export function EventDocumentsViewer({ documents = [] }: EventDocumentsViewerProps) {
  if (!documents || documents.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {documents.map((doc, index) => (
        <a
          key={index}
          href={doc.url}
          download={doc.name}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium transition-colors"
        >
          <span>Regulamento e Documentos</span>
          <Download className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}
