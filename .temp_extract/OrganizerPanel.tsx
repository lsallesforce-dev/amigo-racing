    onSuccess: (data) => {
      toast.success("Configuração bancária salva com sucesso!");
      // Refetch do user data para atualizar recipientId
      utils.auth.me.invalidate();
      utils.organizers.myOrganizers.invalidate();
      setIsBankConfigured(true);
      setIsEditingBank(false);
      // Não limpa o formulário para mostrar os dados cadastrados
      console.log('[setupRecipient] onSuccess - Recipient ID retornado:', data?.recipientId);
    },
    onError: (error: any) => {
      console.error("Erro ao configurar conta Pagar.me:", { error, details: error?.message });
      
      // Mensagem específica para erro de permissão
      if (error.message && error.message.includes("403")) {
        toast.error(
          "Erro de permiss\u00e3o: A chave API do Pagar.me n\u00e3o tem permiss\u00f5es para criar recipients. Verifique as configura\u00e7\u00f5es da sua conta no painel Pagar.me.",
          { duration: 8000 }
        );
      } else if (error.message && error.message.includes("401")) {
        toast.error(
          "Erro de autentica\u00e7\u00e3o: Verifique se o IP do servidor est\u00e1 autorizado no painel Pagar.me.",
          { duration: 6000 }
        );
      } else if (error.message && error.message.includes("412")) {
        toast.error(
          "Erro 412: Formato de dados bancários inválido. Verifique agência, conta e dígito.",
          { duration: 8000 }
        );
      } else if (error.message && error.message.includes("Banco 290")) {
        toast.error(
          error.message + " (PagSeguro: agência 4 dígitos, conta 7 dígitos, dígito 1 dígito)",
          { duration: 8000 }
        );
      } else if (error.message && error.message.includes("RECIPIENT_REFUSED")) {
        toast.error(
          "Dados bancários rejeitados pelo Pagar.me. Verifique se o CPF/CNPJ, banco, agência e conta estão corretos. Contate o suporte do Pagar.me se persistir.",
          { duration: 10000 }
        );
      } else {
        toast.error(error.message || "Erro ao salvar configuração bancária. Verifique os dados e tente novamente.", { duration: 8000 });
      }
    },
  });
  
  const handleSaveBankConfig = () => {