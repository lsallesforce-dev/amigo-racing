import { Download, FileText, Link2, File } from 'lucide-react';

export interface EventDocument {
    name: string;
    url: string;
    type: string;
}

interface EventDocumentsViewerProps {
    documents?: EventDocument[];
}

function iconForType(type: string) {
    if (type === 'pdf') return <FileText className="h-4 w-4 text-red-500" />;
    if (type === 'url') return <Link2 className="h-4 w-4 text-blue-500" />;
    if (type === 'txt' || type === 'doc' || type === 'docx') return <FileText className="h-4 w-4 text-blue-400" />;
    return <File className="h-4 w-4 text-muted-foreground" />;
}

export function EventDocumentsViewer({ documents = [] }: EventDocumentsViewerProps) {
    if (!documents || documents.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            {documents.map((doc, index) => (
                <a
                    key={index}
                    href={doc.url}
                    download={doc.type !== 'url' ? doc.name : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors group"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        {iconForType(doc.type)}
                        <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.name}</p>
                            <p className="text-xs text-muted-foreground uppercase">{doc.type}</p>
                        </div>
                    </div>
                    <Download className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 ml-2" />
                </a>
            ))}
        </div>
    );
}
