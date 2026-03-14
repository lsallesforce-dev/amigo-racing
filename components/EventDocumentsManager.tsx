import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, FileText, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { type EventDocument } from "./EventDocumentsViewer";

interface EventDocumentsManagerProps {
    eventId: number;
    documents: string;
    terms: string;
    onUpdate: (documents: string, terms: string) => void;
}

export function EventDocumentsManager({ eventId, documents: docsProp, terms: termsProp, onUpdate }: EventDocumentsManagerProps) {
    const [documents, setDocuments] = useState<EventDocument[]>([]);
    const [terms, setTerms] = useState("");
    const [newDoc, setNewDoc] = useState<EventDocument>({ name: "", url: "", type: "pdf" });
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        try {
            const parsedDocs = JSON.parse(docsProp || "[]");
            setDocuments(Array.isArray(parsedDocs) ? parsedDocs : []);
        } catch (e) {
            setDocuments([]);
        }
    }, [docsProp]);

    useEffect(() => {
        setTerms(termsProp || "");
    }, [termsProp]);

    const getSignedUrl = trpc.storage.getSignedUrl.useMutation();

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // 1. Get Signed URL from Backend (Bypasses Vercel Size Limit)
            const { url, path: remotePath, publicUrl, token, anonKey } = await getSignedUrl.mutateAsync({ 
                filename: file.name 
            });

            // 2. Upload DIRECTLY to Supabase from Browser
            const uploadResponse = await fetch(url, {
                method: "PUT", // Supabase signed URLs work best with PUT
                body: file,
                headers: {
                    "Content-Type": file.type || "application/octet-stream",
                    "Authorization": `Bearer ${anonKey || token}`,
                    "apikey": anonKey || ""
                }
            });

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Erro no upload direto: ${uploadResponse.status} ${errorText}`);
            }

            // Auto-add the document after successful upload
            const newDocument: EventDocument = {
                name: newDoc.name || file.name.split('.')[0],
                url: publicUrl,
                type: file.type.includes("pdf") ? "pdf" : "txt"
            };

            const updatedDocs = [...documents, newDocument];
            onUpdate(JSON.stringify(updatedDocs), terms);
            
            setNewDoc({ name: "", url: "", type: "pdf" });
            toast.success("Arquivo enviado diretamente para o Storage!");
        } catch (error) {
            toast.error("Erro ao enviar arquivo: " + (error instanceof Error ? error.message : "Erro desconhecido"));
            console.error(error);
        } finally {
            setIsUploading(false);
            e.target.value = "";
        }
    };

    const handleRemoveDocument = (index: number) => {
        const updatedDocs = documents.filter((_, i) => i !== index);
        onUpdate(JSON.stringify(updatedDocs), terms);
    };

    const handleTermsChange = (newVal: string) => {
        setTerms(newVal);
        onUpdate(docsProp, newVal);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Documentos do Evento
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end border p-4 rounded-lg bg-muted/30">
                        <div className="space-y-2">
                            <Label className="text-xs">Nome do Documento (opcional)</Label>
                            <Input
                                placeholder="Ex: Regulamento (deixe vazio para usar nome do arquivo)"
                                value={newDoc.name}
                                onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Upload de Arquivo (PDF, JPG, PNG)</Label>
                            <div className="flex gap-2">
                                <input
                                    type="file"
                                    id="doc-upload"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                    accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                                />
                                <Button
                                    type="button"
                                    variant="default"
                                    className="h-9 w-full flex gap-2"
                                    disabled={isUploading}
                                    onClick={() => document.getElementById('doc-upload')?.click()}
                                >
                                    {isUploading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Plus className="h-4 w-4" />
                                    )}
                                    {isUploading ? "Enviando..." : "Selecionar e Adicionar Arquivo"}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 mt-4">
                        {documents.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8 italic border border-dashed rounded-lg bg-muted/10">
                                Nenhum documento adicionado ainda. Adicione regulamentos, mapas ou links úteis acima.
                            </p>
                        ) : (
                            <div className="grid gap-2">
                                {documents.map((doc, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/30 transition-shadow">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex-shrink-0">
                                                {doc.type === 'pdf' ? (
                                                    <FileText className="h-5 w-5 text-red-500" />
                                                ) : doc.type === 'url' ? (
                                                    <Link2 className="h-5 w-5 text-blue-500" />
                                                ) : (
                                                    <FileText className="h-5 w-5 text-blue-400" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{doc.name}</p>
                                                <p className="text-[10px] text-muted-foreground truncate uppercase font-bold">{doc.type}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                asChild
                                                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                            >
                                                <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                                    <FileText className="h-4 w-4" />
                                                </a>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveDocument(index)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Termo de Aceite do Evento
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Declaração de Responsabilidade</Label>
                        <Textarea
                            placeholder="Insira aqui o texto legal do evento. Os competidores deverão aceitar este termo antes de finalizar a inscrição."
                            className="min-h-[250px] leading-relaxed text-sm resize-none"
                            value={terms}
                            onChange={(e) => handleTermsChange(e.target.value)}
                        />
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
                            <Plus className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0 rotate-45" />
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                <strong>Importante:</strong> Se este campo estiver em branco, nenhum termo de aceite será exigido do competidor durante a inscrição.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="p-4 bg-muted/20 border rounded-lg">
                <p className="text-xs text-muted-foreground text-center">
                    As alterações acima serão aplicadas ao clicar no botão <strong>Salvar Alterações</strong> do diálogo.
                </p>
            </div>
        </div>
    );
}
