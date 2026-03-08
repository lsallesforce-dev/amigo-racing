    const files = e.currentTarget.files;
    if (!files) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();

        reader.onload = async (event) => {
          try {
            const base64 = event.target?.result as string;
            const result = await uploadFile.mutateAsync({
              base64,
              fileName: file.name,
              contentType: file.type,
            });

            const newDoc: EventDocument = {
              name: file.name,
              url: result.url,
              type: 'other',
            };

            const updated = [...localDocuments, newDoc];
            setLocalDocuments(updated);
            onDocumentsChange?.(updated);
            toast.success(`Documento "${file.name}" adicionado com sucesso!`);
          } catch (error) {
            toast.error(`Erro ao fazer upload de "${file.name}"`);
          }
        };

        reader.readAsDataURL(file);
      }
    } finally {
      setIsUploading(false);
      e.currentTarget.value = '';
    }
  };