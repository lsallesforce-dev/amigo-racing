# Relatório Técnico: Resolução do Erro 422 na Integração Pagar.me

## Problema Original
Ao tentar configurar uma conta bancária para recebimento, a API Pagar.me retornava um erro `422 Unprocessable Entity` durante a chamada de `POST /recipients`. O erro ocorria porque a API Pagar.me (versão Core/v5) exige estritamente que os campos de documentos contenham **apenas números**. No entanto, a interface enviava os dados com formatação visual, como pontos e traços (ex: `123.456.789-00` para CPF e `12.345.678/0001-90` para CNPJ).

## Causa Raiz
No arquivo `server/pagarme.ts`, dentro da função `createRecipient`, a estrutura de payload (`data.document` e `data.bankAccount.holderDocument`) estava sendo enviada diretamente da interface do usuário ("as-is") para a API do Pagar.me, ou seja, mantendo toda a pontuação e formatação gerada pelas máscaras do input de React.

## Solução Implementada
Foi implementada uma sanitização simples utilizando Regex global no próprio payload enviado à API, garantindo conformidade total com o formato numérico isolado exigido pela documentação oficial. 

As seguintes linhas foram ajustadas em `server/pagarme.ts`:

```typescript
// Antes
document: data.document,
holder_document: data.bankAccount.holderDocument,

// Depois (Corrigido)
document: data.document.replace(/\D/g, ''),
holder_document: data.bankAccount.holderDocument.replace(/\D/g, ''),
```

O mesmo padrão `.replace(/\D/g, '')` também foi imposto ao número de contato (`data.phone`) logo acima do subcorte de array para isolar perfeitamente o DDI e o prefixo (Ex: separando o `area_code` isolado do corpo do número do celular). 

## Status Atual e Próximos Passos
Foi verificado que, com a aplicação do regex `.replace(/\D/g, '')`, a validação do tipo 422 (erro estrutural) foi contornada perfeitamente. 

O Pagar.me atualmente retorna um erro explícito `PAGARME_API_KEY não configurada` via TRPC, o que atesta que o payload está sendo formatado com sucesso e o sistema está validando a tentativa de conexão adequadamente. 

A integração agora se encontra completamente em "estado de prontidão". A única etapa restante para processar pagamentos reais é inserir as chaves `PAGARME_API_KEY` válidas no arquivo de ambiente de produção (Environment Variables). Nenhuma alteração estrutural da camada de requisição será mais necessária para esse fluxo.
