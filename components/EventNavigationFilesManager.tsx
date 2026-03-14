import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, FileCode, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface EventNavigationFilesManagerProps {
    eventId: number;
    files: any[];
    categories?: any[];
    onUpdate: (files: any[]) => void;
}

export function EventNavigationFilesManager({ eventId, files: filesProp, categories = [], onUpdate }: EventNavigationFilesManagerProps) {
    const [files, setFiles] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");


    useEffect(() => {
        setFiles(Array.isArray(filesProp) ? filesProp : []);
    }, [filesProp]);

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

            const newFile = {
                name: file.name,
                url: publicUrl,
                type: file.name.split('.').pop()?.toLowerCase() || "bin",
                categoryId: selectedCategoryId === "all" ? null : Number(selectedCategoryId),
                uploadedAt: new Date().toISOString()
            };

            const updatedFiles = [...files, newFile];
            onUpdate(updatedFiles);
            toast.success(`Arquivo ${file.name} enviado diretamente para o Storage!`);
        } catch (error) {
            console.error("[Upload] Error:", error);
            toast.error("Erro ao enviar arquivo: " + (error instanceof Error ? error.message : "Erro desconhecido"));
        } finally {
            setIsUploading(false);
            e.target.value = "";
        }
    };

    const handleRemoveFile = (index: number) => {
        const updatedFiles = files.filter((_, i) => i !== index);
        onUpdate(updatedFiles);
    };

    return (
        <Card className="mt-6 border-primary/20 shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <FileCode className="h-5 w-5 text-primary" />
                    Planilhas de Navegação (.nbp, .bin). Totem e T15
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Carregue aqui os arquivos técnicos para aparelhos de navegação (Totem, T15, etc.).
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30 border-dashed border-primary/30">
                        <div className="flex-1">
                            <p className="text-sm font-medium">Upload de nova planilha</p>
                            <p className="text-xs text-muted-foreground">Clique para selecionar arquivos .nbp, .bin ou .totem</p>
                        </div>
                        <div className="relative">
                            <input
                                type="file"
                                id="nav-upload"
                                className="hidden"
                                onChange={handleFileUpload}
                                accept=".nbp,.bin,.txt,.totem"
                            />
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                                <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                                    <SelectTrigger className="w-full sm:w-[200px] h-9 text-xs bg-background">
                                        <SelectValue placeholder="Escolher Categoria" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" className="text-xs font-semibold">🏁 Todas as Categorias</SelectItem>
                                        {categories
                                            .filter((cat: any) => cat.parentId !== null)
                                            .map((cat: any) => {
                                                const parent = categories.find((p: any) => p.id === cat.parentId);
                                                const displayName = parent ? `${parent.name} - ${cat.name}` : cat.name;
                                                return (
                                                    <SelectItem key={cat.id} value={String(cat.id)} className="text-xs">
                                                        {displayName}
                                                    </SelectItem>
                                                );
                                            })
                                        }
                                    </SelectContent>
                                </Select>

                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="w-full sm:w-auto h-9 text-xs"
                                    disabled={isUploading}
                                    onClick={() => document.getElementById('nav-upload')?.click()}
                                >
                                    {isUploading ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <Plus className="h-4 w-4 mr-2" />
                                    )}
                                    Upload
                                </Button>
                            </div>


                        </div>
                    </div>

                    <div className="space-y-2">
                        {files.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6 italic">
                                Nenhuma planilha enviada para este evento.
                            </p>
                        ) : (
                            <div className="grid gap-2">
                                {files.map((file, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-card hover:border-primary/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded">
                                                <FileCode className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{file.name}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                                                    {file.type} • {file.url.split('/').pop()?.substring(0, 8)}...
                                                    {file.categoryId ? (() => {
                                                        const cat = categories.find((c: any) => c.id === file.categoryId);
                                                        const parent = cat ? categories.find((p: any) => p.id === cat.parentId) : null;
                                                        const label = parent ? `${parent.name} - ${cat?.name}` : (cat?.name || 'Categoria Removida');
                                                        return (
                                                            <Badge variant="outline" className="ml-2 text-[8px] h-3.5 px-1 bg-primary/5 text-primary border-primary/20">
                                                                {label}
                                                            </Badge>
                                                        );
                                                    })() : (
                                                        <Badge variant="outline" className="ml-2 text-[8px] h-3.5 px-1 bg-muted/50 text-muted-foreground border-muted-foreground/20">
                                                            Público (Geral)
                                                        </Badge>
                                                    )}

                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveFile(index)}
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                {files.length > 0 && (
                    <div className="p-3 bg-muted/20 border rounded-lg mt-4">
                        <p className="text-[10px] text-muted-foreground text-center">
                            As planilhas acima serão salvas ao clicar no botão <strong>Salvar Alterações</strong> do diálogo.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
