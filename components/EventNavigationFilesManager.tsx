import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, FileCode, Loader2, Tag, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isoParaInputBrasilia, inputBrasiliaParaIso, formatarBrasilia } from "@/shared/horarioBrasilia";
import { navigationFileCategories } from "@/shared/navigationFiles";
import { Badge } from "@/components/ui/badge";

interface EventNavigationFilesManagerProps {
    eventId: number;
    files: any[];
    categories?: any[];
    onUpdate: (files: any[]) => void;
}

/**
 * Escolha de categorias da planilha: chips do que já foi marcado + um select pra
 * somar mais uma. Nenhuma marcada = planilha pública (vale pra todo mundo).
 * É multi porque uma mesma planilha costuma servir a duas categorias
 * (ex.: Carros Graduado e Turismo compartilham a mesma média).
 */
function SeletorCategorias({ selecionadas, subcategorias, nomeCategoria, onToggle, compacto }: {
    selecionadas: number[];
    subcategorias: any[];
    nomeCategoria: (id: number) => string;
    onToggle: (categoryId: number) => void;
    compacto?: boolean;
}) {
    const disponiveis = subcategorias.filter((cat: any) => !selecionadas.includes(Number(cat.id)));

    return (
        <div className={`flex flex-wrap items-center gap-1 ${compacto ? "" : "w-full sm:w-[220px]"}`}>
            {selecionadas.length === 0 && (
                <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-muted/50 text-muted-foreground border-muted-foreground/20">
                    Público (Geral)
                </Badge>
            )}
            {selecionadas.map((id) => (
                <Badge
                    key={id}
                    variant="outline"
                    className="text-[9px] h-5 pl-1.5 pr-0.5 gap-0.5 bg-primary/5 text-primary border-primary/20"
                >
                    {nomeCategoria(id)}
                    <button
                        type="button"
                        onClick={() => onToggle(id)}
                        className="ml-0.5 rounded-sm hover:bg-primary/20 p-0.5"
                        aria-label={`Remover ${nomeCategoria(id)}`}
                    >
                        <X className="h-2.5 w-2.5" />
                    </button>
                </Badge>
            ))}
            {disponiveis.length > 0 && (
                <Select value="" onValueChange={(v) => onToggle(Number(v))}>
                    <SelectTrigger className={`${compacto ? "h-5 w-[112px] text-[9px]" : "h-7 w-[150px] text-[10px]"} bg-background`}>
                        <SelectValue placeholder="+ categoria" />
                    </SelectTrigger>
                    <SelectContent>
                        {disponiveis.map((cat: any) => (
                            <SelectItem key={cat.id} value={String(cat.id)} className="text-xs">
                                {nomeCategoria(Number(cat.id))}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
    );
}

// O horário digitado é SEMPRE horário de Brasília (é o horário da prova), não o
// fuso da máquina do organizador. Guardado em ISO UTC. Ver shared/horarioBrasilia.ts.
function rotuloLiberacao(iso?: string | null): string {
    if (!iso) return "Liberada";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Liberada";
    const quando = formatarBrasilia(iso, { comAno: false });
    return d.getTime() <= Date.now() ? `Liberada em ${quando}` : `Libera ${quando}`;
}

export function EventNavigationFilesManager({ eventId, files: filesProp, categories = [], onUpdate }: EventNavigationFilesManagerProps) {
    const [files, setFiles] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    // Uma planilha pode servir a várias categorias (ex.: Graduado + Turismo).
    // Lista vazia = pública (vale pra todo mundo do evento).
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
    // Liberação escolhida para o PRÓXIMO arquivo enviado. Vazio = libera assim que salvar.
    const [releaseAtInput, setReleaseAtInput] = useState<string>("");


    useEffect(() => {
        setFiles(Array.isArray(filesProp) ? filesProp : []);
    }, [filesProp]);

    // Só subcategorias entram na escolha (as categorias-pai são agrupadores).
    const subcategorias = categories.filter((cat: any) => cat.parentId !== null);

    const nomeCategoria = (id: number) => {
        const cat = categories.find((c: any) => Number(c.id) === Number(id));
        if (!cat) return "Categoria removida";
        const parent = categories.find((p: any) => p.id === cat.parentId);
        return parent ? `${parent.name} - ${cat.name}` : cat.name;
    };

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

            // 2. Upload DIRECTLY to S3/R2 from Browser
            const uploadResponse = await fetch(url, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": file.type || "application/octet-stream"
                }
            });

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Erro no upload direto: ${uploadResponse.status} ${errorText}`);
            }

            const newFile = {
                // id estável: é por ele que o competidor pede o download. Sem id
                // sobraria o índice do array, que muda quando uma planilha é apagada.
                id: (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: file.name,
                url: publicUrl,
                type: file.name.split('.').pop()?.toLowerCase() || "bin",
                categoryIds: selectedCategoryIds,
                // mantido para as telas antigas que ainda leem categoryId
                categoryId: selectedCategoryIds.length === 1 ? selectedCategoryIds[0] : null,
                releaseAt: inputBrasiliaParaIso(releaseAtInput),
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

    // Remarcar a liberação de uma planilha já enviada, sem precisar subir de novo.
    const handleChangeReleaseAt = (index: number, valor: string) => {
        const updatedFiles = files.map((f, i) =>
            i === index ? { ...f, releaseAt: inputBrasiliaParaIso(valor) } : f
        );
        onUpdate(updatedFiles);
    };

    // Adiciona/remove categoria de uma planilha já enviada (também sem reenviar).
    const handleToggleCategoria = (index: number, categoryId: number) => {
        const updatedFiles = files.map((f, i) => {
            if (i !== index) return f;
            const atuais = navigationFileCategories(f);
            const novas = atuais.includes(categoryId)
                ? atuais.filter(c => c !== categoryId)
                : [...atuais, categoryId];
            return {
                ...f,
                categoryIds: novas,
                categoryId: novas.length === 1 ? novas[0] : null,
            };
        });
        onUpdate(updatedFiles);
    };

    const toggleCategoriaUpload = (categoryId: number) => {
        setSelectedCategoryIds(prev =>
            prev.includes(categoryId) ? prev.filter(c => c !== categoryId) : [...prev, categoryId]
        );
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
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 border rounded-lg bg-muted/30 border-dashed border-primary/30">
                        <div className="flex-1">
                            <p className="text-sm font-medium">Upload de nova planilha</p>
                            <p className="text-xs text-muted-foreground">Clique para selecionar arquivos .nbp, .bin ou .totem</p>
                            <div className="mt-2">
                                <label htmlFor="nav-release-at" className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Liberar para os competidores em (horário de Brasília)
                                </label>
                                <input
                                    id="nav-release-at"
                                    type="datetime-local"
                                    value={releaseAtInput}
                                    onChange={(e) => setReleaseAtInput(e.target.value)}
                                    className="mt-1 h-9 w-full sm:w-[220px] rounded-md border bg-background px-2 text-xs"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Em branco = libera assim que salvar. Só baixa quem está com a inscrição paga.
                                </p>
                            </div>
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
                                <div className="w-full sm:w-[230px]">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                                        Categorias desta planilha
                                    </p>
                                    <SeletorCategorias
                                        selecionadas={selectedCategoryIds}
                                        subcategorias={subcategorias}
                                        nomeCategoria={nomeCategoria}
                                        onToggle={toggleCategoriaUpload}
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                        Pode marcar mais de uma. Nenhuma = vale pra todas.
                                    </p>
                                </div>

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
                                    <div key={index} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg bg-card hover:border-primary/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded">
                                                <FileCode className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">{file.name}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                                                    {file.type} • {file.url.split('/').pop()?.substring(0, 8)}...
                                                </p>
                                                <div className="mt-1">
                                                    <SeletorCategorias
                                                        compacto
                                                        selecionadas={navigationFileCategories(file)}
                                                        subcategorias={subcategorias}
                                                        nomeCategoria={nomeCategoria}
                                                        onToggle={(catId) => handleToggleCategoria(index, catId)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex flex-col">
                                                <input
                                                    type="datetime-local"
                                                    value={isoParaInputBrasilia(file.releaseAt)}
                                                    onChange={(e) => handleChangeReleaseAt(index, e.target.value)}
                                                    className="h-8 w-[190px] rounded-md border bg-background px-2 text-xs"
                                                />
                                                <span className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                                    <Clock className="h-2.5 w-2.5" /> {rotuloLiberacao(file.releaseAt)}
                                                </span>
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
