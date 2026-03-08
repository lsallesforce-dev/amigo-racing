      } as any);
      console.log('[Pagar.me] Fetch completado, status:', response.status);
      
      data = await response.json();
      console.log('[Pagar.me] JSON parseado com sucesso');
    } catch (fetchError: any) {
      console.error('[Pagar.me] ERRO NO FETCH:', fetchError.message);
      console.error('[Pagar.me] Stack:', fetchError.stack);
      throw fetchError;
    }
    
    console.log('[Pagar.me] RESPONSE STATUS:', response.status);
    console.log('[Pagar.me] RESPONSE DATA COMPLETO:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("[Pagar.me] API error:", {
        status: response.status,
        statusText: response.statusText,
        data,
      });
      
      // LOG DETALHADO DO ERRO 422
      if (response.status === 422) {
        console.error('[Pagar.me] ❌ ERRO 422 - UNPROCESSABLE ENTITY');
        console.error('[Pagar.me] CORPO COMPLETO DA RESPOSTA:', JSON.stringify(data, null, 2));
        if (data.errors && Array.isArray(data.errors)) {
          console.error('[Pagar.me] ERROS DETALHADOS:');
          data.errors.forEach((error: any, index: number) => {
            console.error(`  [${index}] Campo: ${error.parameter || 'desconhecido'}`);
            console.error(`      Mensagem: ${error.message || 'sem mensagem'}`);
            console.error(`      Descrição: ${error.description || 'sem descrição'}`);
          });
        }
      }
      
      let errorMsg = `Pagar.me API error: ${response.status}`;
      if (data.errors && Array.isArray(data.errors)) {
        const msgs = data.errors.map((e: any) => {
          const param = e.parameter;
          if (param === 'conta' || param === 'account_number') return 'numero da conta invalido';
          if (param === 'conta_dv' || param === 'account_check_digit') return 'digito da conta invalido';
          if (param === 'agencia' || param === 'branch_number') return 'numero da agencia invalido';
          if (param === 'phone' || param === 'phones') return 'telefone obrigatorio';
          if (param === 'holder_name') return 'nome do titular obrigatorio';
          if (param === 'holder_document') return 'documento do titular obrigatorio';
          return param || 'erro desconhecido';
        });
        errorMsg += ` - ${msgs.join(', ')}`;
      }
      console.error('[Pagar.me] RECIPIENT REJEITADO:', errorMsg);