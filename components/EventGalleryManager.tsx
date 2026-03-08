import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { compressImage } from '@/lib/imageCompression';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Upload, Link2, Image as ImageIcon, X, Loader2 } from 'lucide-react';

export function EventGalleryManager({ eventId }: { eventId: number }) {
    const [urlInput, setUrlInput] = useState('');
    const [captionInput, setCaptionInput] = useState('');
    const [uploading, setUploading] = useState(false);
    const [showUrlForm, setShowUrlForm] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const utils = trpc.useUtils();

    const { data: images = [], isLoading } = (trpc.gallery as any).listByEvent.useQuery(
        { eventId },
        { enabled: !!eventId }
    );

    const addImage = (trpc.gallery as any).addImage.useMutation({
        onSuccess: () => {
            toast.success('Imagem adicionada!');
            utils.gallery.listByEvent.invalidate({ eventId });
        },
        onError: (err: any) => toast.error(err.message || 'Erro ao adicionar imagem'),
    });

    const deleteImage = (trpc.gallery as any).deleteImage.useMutation({
        onSuccess: () => {
            toast.success('Imagem removida!');
            utils.gallery.listByEvent.invalidate({ eventId });
        },
        onError: (err: any) => toast.error(err.message || 'Erro ao remover imagem'),
    });

    const handleFileUpload = async (file: File) => {
        setUploading(true);
        try {
            const base64 = await compressImage(file);
            await addImage.mutateAsync({
                eventId,
                imageUrl: base64,
                caption: file.name.replace(/\.[^/.]+$/, ''),
                displayOrder: images.length,
            });
        } catch {
            toast.error('Erro ao processar imagem');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleAddUrl = async () => {
        if (!urlInput.trim()) { toast.error('Informe a URL da imagem'); return; }
        await addImage.mutateAsync({
            eventId,
            imageUrl: urlInput.trim(),
            caption: captionInput.trim() || undefined,
            displayOrder: images.length,
        });
        setUrlInput('');
        setCaptionInput('');
        setShowUrlForm(false);
    };

    return (
        <div className="space-y-4">
            {/* Cabeçalho com botões de ação */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-semibold">Galeria de Imagens</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Fotos que aparecem na página pública do evento
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowUrlForm(v => !v)}
                    >
                        <Link2 className="h-4 w-4 mr-1" />
                        URL
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || addImage.isPending}
                    >
                        {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                        {uploading ? 'Enviando…' : 'Upload'}
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            for (const file of files) await handleFileUpload(file);
                        }}
                    />
                </div>
            </div>

            {/* Formulário de URL */}
            {showUrlForm && (
                <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
                    <div>
                        <Label className="text-xs">URL da Imagem *</Label>
                        <Input
                            placeholder="https://exemplo.com/foto.jpg"
                            value={urlInput}
                            onChange={e => setUrlInput(e.target.value)}
                            className="mt-1 text-sm"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Legenda (opcional)</Label>
                        <Input
                            placeholder="Ex: Largada da prova"
                            value={captionInput}
                            onChange={e => setCaptionInput(e.target.value)}
                            className="mt-1 text-sm"
                        />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => { setShowUrlForm(false); setUrlInput(''); setCaptionInput(''); }}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handleAddUrl} disabled={addImage.isPending}>
                            {addImage.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                            Adicionar
                        </Button>
                    </div>
                </div>
            )}

            {/* Grid de imagens */}
            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : images.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                    {images.map((img: any) => (
                        <div key={img.id} className="relative group rounded-lg overflow-hidden border bg-muted">
                            <img
                                src={img.imageUrl}
                                alt={img.caption || 'Imagem do evento'}
                                className="w-full h-36 object-cover"
                            />
                            {img.caption && (
                                <div className="px-2 py-1 text-xs text-muted-foreground border-t truncate bg-background/80">
                                    {img.caption}
                                </div>
                            )}
                            <button
                                onClick={() => deleteImage.mutate({ imageId: img.id })}
                                disabled={deleteImage.isPending}
                                className="absolute top-1.5 right-1.5 bg-background/80 hover:bg-destructive hover:text-white text-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remover imagem"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg text-muted-foreground gap-2">
                    <ImageIcon className="h-10 w-10 opacity-30" />
                    <p className="text-sm">Nenhuma imagem na galeria</p>
                    <p className="text-xs">Clique em "Upload" para adicionar fotos do seu computador</p>
                </div>
            )}
        </div>
    );
}
