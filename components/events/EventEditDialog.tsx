import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { compressImage } from '@/lib/imageCompression';
import { EventGalleryManager } from "@/components/EventGalleryManager";
import { EventDocumentsManager } from "@/components/EventDocumentsManager";
import { EventNavigationFilesManager } from "@/components/EventNavigationFilesManager";

function MultiImageUpload({
    images,
    onUpload,
    onRemove,
    label,
    description,
    isUploading,
}: {
    images: string[],
    onUpload: (files: FileList) => void,
    onRemove: (index: number) => void,
    label: string,
    description?: string,
    isUploading: boolean,
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-semibold">{label}</h3>
                    {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                </div>
                <div className="flex items-center gap-2">
                    {isUploading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUploading}
                        onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.multiple = true;
                            input.onchange = (e) => {
                                const files = (e.target as HTMLInputElement).files;
                                if (files && files.length > 0) onUpload(files);
                            };
                            input.click();
                        }}
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {images.map((url, index) => (
                    <div key={index} className="relative aspect-square group rounded-lg overflow-hidden border bg-muted">
                        <img src={url} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                                type="button"
                                onClick={() => onRemove(index)}
                                className="bg-destructive text-white rounded-full p-1.5 hover:scale-110 transition-transform"
                                title="Remover"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ))}
                {!isUploading && images.length === 0 && (
                    <div className="col-span-full py-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
                        <Upload className="h-8 w-8 mb-2 opacity-20" />
                        <p className="text-sm">Nenhuma imagem enviada</p>
                    </div>
                )}
            </div>
        </div>
    );
}

interface EventEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    event: any;
    onSuccess?: () => void;
}

export function EventEditDialog({ open, onOpenChange, event, onSuccess }: EventEditDialogProps) {
    const [editingEvent, setEditingEvent] = useState<any>(null);
    const [isUploadingSponsors, setIsUploadingSponsors] = useState(false);
    const [isUploadingGallery, setIsUploadingGallery] = useState(false);

    const utils = trpc.useUtils();
    const uploadImage = trpc.upload.image.useMutation();
    const updateEvent = trpc.events.update.useMutation({
        onSuccess: async () => {
            toast.success("Evento atualizado com sucesso!");
            onOpenChange(false);
            if (onSuccess) onSuccess();
            await utils.events.myEvents.invalidate();
            await utils.events.listOpen.refetch();
            await utils.events.listAll.refetch();
        },
        onError: (error) => {
            toast.error(error.message || "Erro ao atualizar evento");
        },
    });

    const { data: championshipsList, isLoading: isChampsLoading } = trpc.championships.getAllActive.useQuery();
    const { data: eventCategories } = trpc.categories.listByEvent.useQuery(
        { eventId: editingEvent?.id || 0 },
        { enabled: !!editingEvent?.id }
    );

    useEffect(() => {
        if (event) {
            const startIso = event.startDate ? new Date(event.startDate).toISOString() : '';
            const endIso = event.endDate ? new Date(event.endDate).toISOString() : '';

            setEditingEvent({
                ...event,
                startDate: startIso ? startIso.split('T')[0] : '',
                startTime: startIso ? startIso.split('T')[1].substring(0, 5) : '08:00',
                endDate: endIso ? endIso.split('T')[0] : '',
                endTime: endIso ? endIso.split('T')[1].substring(0, 5) : '18:00',
                sponsors: event.sponsors || [],
                gallery: event.gallery || [],
                documents: event.documents || "[]",
                terms: event.terms || "",
                navigationFiles: event.navigationFiles || [],
            });

            // We need to fetch the stage link separately or have it passed
            // For simplicity, we'll try to get it if not present
            if (editingEvent?.championshipId === undefined) {
                // This might need more logic if we want to show existing championship link
            }
        }
    }, [event]);

    // Load championship stage if missing
    useEffect(() => {
        if (editingEvent?.id && editingEvent?.championshipId === undefined) {
            utils.championships.getStageByEventId.fetch({ eventId: editingEvent.id }).then(stage => {
                if (stage) {
                    setEditingEvent(prev => ({
                        ...prev,
                        championshipId: stage.championshipId,
                        originalChampionshipId: stage.championshipId
                    }));
                } else {
                    setEditingEvent(prev => ({ ...prev, championshipId: null }));
                }
            });
        }
    }, [editingEvent?.id]);

    const handleMultiUpload = async (files: FileList, target: 'sponsors' | 'gallery') => {
        const isSponsors = target === 'sponsors';
        if (isSponsors) setIsUploadingSponsors(true);
        else setIsUploadingGallery(true);

        try {
            const urls = [...(editingEvent[target] || [])];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const base64 = await compressImage(file);
                const { url } = await uploadImage.mutateAsync({
                    base64,
                    fileName: `event_${target}_${file.name}`,
                    contentType: file.type
                });
                urls.push(url);
                setEditingEvent(prev => ({ ...prev, [target]: [...urls] }));
            }
        } catch (error) {
            toast.error("Erro ao fazer upload de uma ou mais imagens.");
        } finally {
            if (isSponsors) setIsUploadingSponsors(false);
            else setIsUploadingGallery(false);
        }
    };

    const handleUpdateEvent = async () => {
        if (!editingEvent) return;

        const startDateTime = `${editingEvent.startDate}T${editingEvent.startTime}:00`;
        const endDateTime = `${editingEvent.endDate}T${editingEvent.endTime}:00`;

        updateEvent.mutate({
            ...editingEvent,
            startDate: startDateTime,
            endDate: endDateTime,
        });
    };

    if (!editingEvent) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Editar Evento</DialogTitle>
                    <DialogDescription>
                        Atualize as informações do evento
                    </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="info" className="w-full">
                    <div className="overflow-x-auto pb-1 scrollbar-hide">
                        <TabsList className="mb-4 flex w-full min-w-max">
                            <TabsTrigger value="info">Informações</TabsTrigger>
                            <TabsTrigger value="sponsors">Patrocinadores</TabsTrigger>
                            <TabsTrigger value="gallery">Galeria</TabsTrigger>
                            <TabsTrigger value="documents">Documentos</TabsTrigger>
                        </TabsList>
                    </div>
                    <TabsContent value="info" className="space-y-4 mt-4">
                        <div>
                            <Label htmlFor="edit-name">Nome do Evento *</Label>
                            <Input
                                id="edit-name"
                                value={editingEvent.name || ""}
                                onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="edit-description">Descrição</Label>
                            <Textarea
                                id="edit-description"
                                value={editingEvent.description || ""}
                                onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })}
                                rows={4}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-startDate" className="flex justify-between">
                                    <span>Data Início *</span>
                                    <span className="text-[10px] text-muted-foreground mr-1">Hora (opcional)</span>
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="edit-startDate"
                                        type="date"
                                        className="flex-1"
                                        value={editingEvent.startDate || ""}
                                        onChange={(e) => setEditingEvent({ ...editingEvent, startDate: e.target.value })}
                                    />
                                    <Input
                                        type="time"
                                        className="w-[100px]"
                                        value={editingEvent.startTime || "08:00"}
                                        onChange={(e) => setEditingEvent({ ...editingEvent, startTime: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-endDate" className="flex justify-between">
                                    <span>Data Fim *</span>
                                    <span className="text-[10px] text-muted-foreground mr-1">Hora (opcional)</span>
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="edit-endDate"
                                        type="date"
                                        className="flex-1"
                                        value={editingEvent.endDate || ""}
                                        onChange={(e) => setEditingEvent({ ...editingEvent, endDate: e.target.value })}
                                    />
                                    <Input
                                        type="time"
                                        className="w-[100px]"
                                        value={editingEvent.endTime || "18:00"}
                                        onChange={(e) => setEditingEvent({ ...editingEvent, endTime: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="edit-location">Local *</Label>
                            <Input
                                id="edit-location"
                                value={editingEvent.location || ""}
                                onChange={(e) => setEditingEvent({ ...editingEvent, location: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="edit-city">Cidade *</Label>
                                <Input
                                    id="edit-city"
                                    value={editingEvent.city || ""}
                                    onChange={(e) => setEditingEvent({ ...editingEvent, city: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label htmlFor="edit-state">Estado</Label>
                                <Input
                                    id="edit-state"
                                    value={editingEvent.state || ""}
                                    onChange={(e) => setEditingEvent({ ...editingEvent, state: e.target.value })}
                                    maxLength={2}
                                />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="edit-status">Status do Evento</Label>
                            <Select
                                value={editingEvent.status || 'open'}
                                onValueChange={(val: any) => setEditingEvent({ ...editingEvent, status: val })}
                            >
                                <SelectTrigger id="edit-status" className="w-full">
                                    <SelectValue placeholder="Selecione o status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="open">Aberto</SelectItem>
                                    <SelectItem value="closed">Fechado</SelectItem>
                                    <SelectItem value="cancelled">Cancelado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="edit-championship">Vincular a um Campeonato</Label>
                            <Select
                                value={editingEvent.championshipId ? String(editingEvent.championshipId) : "none"}
                                onValueChange={(val) => setEditingEvent({ ...editingEvent, championshipId: val === "none" ? null : parseInt(val) })}
                            >
                                <SelectTrigger id="edit-championship" className="w-full">
                                    <SelectValue placeholder="Selecione um campeonato" />
                                </SelectTrigger>
                                <SelectContent position="popper" className="z-[9999]">
                                    {isChampsLoading ? (
                                        <SelectItem value="loading" disabled>Carregando...</SelectItem>
                                    ) : (
                                        <>
                                            <SelectItem value="none">Nenhum campeonato vinculado</SelectItem>
                                            {championshipsList && championshipsList.length > 0 ? (
                                                <>
                                                    {championshipsList.map((champ) => (
                                                        <SelectItem key={champ.id} value={String(champ.id)}>
                                                            {champ.name} ({champ.year}) {champ.organizerName ? `- Org: ${champ.organizerName}` : ''}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            ) : (
                                                <SelectItem value="empty" disabled>Nenhum campeonato encontrado</SelectItem>
                                            )}
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground mt-1">Ao vincular a um campeonato, os resultados deste evento poderão ser computados na classificação geral.</p>
                        </div>
                        <div>
                            <Label htmlFor="edit-image">Imagem do Evento</Label>
                            <Input
                                id="edit-image"
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        try {
                                            const compressedBase64 = await compressImage(file);
                                            setEditingEvent({ ...editingEvent, imageUrl: compressedBase64 });
                                        } catch (error) {
                                            toast.error('Erro ao processar imagem');
                                        }
                                    }
                                }}
                            />
                            {editingEvent.imageUrl && (
                                <div className="mt-2 bg-gradient-to-br from-gray-900 to-gray-800 rounded">
                                    <img src={encodeURI(editingEvent.imageUrl)} alt="Preview" className="w-full h-48 object-contain rounded" />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="edit-show-registrations"
                                checked={editingEvent.showRegistrations ?? true}
                                onChange={(e) => setEditingEvent({ ...editingEvent, showRegistrations: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            <Label htmlFor="edit-show-registrations" className="text-sm font-normal cursor-pointer">
                                Permitir que competidores vejam a lista de inscritos
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="edit-allow-cancellation"
                                checked={editingEvent.allowCancellation ?? false}
                                onChange={(e) => setEditingEvent({ ...editingEvent, allowCancellation: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            <Label htmlFor="edit-allow-cancellation" className="text-sm font-normal cursor-pointer">
                                Permitir que competidores solicitem cancelamento da inscrição
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="edit-has-shirts"
                                checked={editingEvent.hasShirts ?? true}
                                onChange={(e) => setEditingEvent({ ...editingEvent, hasShirts: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            <Label htmlFor="edit-has-shirts" className="text-sm font-normal cursor-pointer">
                                Evento possui camiseta (Habilita a escolha de tamanhos na inscrição)
                            </Label>
                        </div>
                        <div className="border-t pt-4 mt-4 space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="edit-is-external"
                                    checked={editingEvent.isExternal ?? false}
                                    onChange={(e) => setEditingEvent({ ...editingEvent, isExternal: e.target.checked })}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                <Label htmlFor="edit-is-external" className="text-sm font-bold cursor-pointer text-primary">
                                    Evento Externo (Vitrine)
                                </Label>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                Ao marcar como externo, a loja oficial e o formulário de inscrição nativo serão ocultados.
                            </p>
                            {editingEvent.isExternal && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                    <Label htmlFor="edit-external-url">Link Externo para Inscrição / Informações</Label>
                                    <Input
                                        id="edit-external-url"
                                        placeholder="https://exemplo.com.br/inscricao"
                                        value={editingEvent.externalUrl || ""}
                                        onChange={(e) => setEditingEvent({ ...editingEvent, externalUrl: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="sponsors" className="mt-4">
                        <MultiImageUpload
                            label="Patrocinadores"
                            description="Logo dos patrocinadores que aparecerão na página do evento"
                            images={editingEvent.sponsors || []}
                            isUploading={isUploadingSponsors}
                            onUpload={(files) => handleMultiUpload(files, 'sponsors')}
                            onRemove={(index) => {
                                const newSponsors = [...(editingEvent.sponsors || [])];
                                newSponsors.splice(index, 1);
                                setEditingEvent({ ...editingEvent, sponsors: newSponsors });
                            }}
                        />
                    </TabsContent>
                    <TabsContent value="gallery" className="mt-4">
                        <MultiImageUpload
                            label="Galeria de Fotos"
                            description="Fotos do rali para a galeria pública"
                            images={editingEvent.gallery || []}
                            isUploading={isUploadingGallery}
                            onUpload={(files) => handleMultiUpload(files, 'gallery')}
                            onRemove={(index) => {
                                const newGallery = [...(editingEvent.gallery || [])];
                                newGallery.splice(index, 1);
                                setEditingEvent({ ...editingEvent, gallery: newGallery });
                            }}
                        />
                    </TabsContent>
                    <TabsContent value="documents" className="mt-4 space-y-6">
                        <EventDocumentsManager
                            eventId={editingEvent.id}
                            documents={editingEvent.documents}
                            terms={editingEvent.terms}
                            onUpdate={(docs, terms) => setEditingEvent({ ...editingEvent, documents: docs, terms })}
                        />
                        <EventNavigationFilesManager
                            eventId={editingEvent.id}
                            files={editingEvent.navigationFiles}
                            categories={eventCategories || []}
                            onUpdate={(files) => setEditingEvent({ ...editingEvent, navigationFiles: files })}
                        />
                    </TabsContent>
                </Tabs>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleUpdateEvent} disabled={updateEvent.isPending}>
                        {updateEvent.isPending ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
