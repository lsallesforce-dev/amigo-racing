# Amigo Racing - TODO

## Landing Page
- [x] Criar estrutura e design da landing page
- [x] Adicionar seção hero com CTA
- [x] Implementar seções de features e benefícios
- [x] Adicionar footer e navegação
- [x] Integrar com fluxo de autenticação
- [x] Testar responsividade

## Autenticação e Cadastro
- [x] Corrigir fluxo de autenticação para múltiplos usuários
- [x] Criar página de cadastro de organizador
- [x] Adicionar campos de endereço (rua, cidade, estado, CEP)
- [ ] Implementar redirecionamento automático pós-login para cadastro

## Painel do Organizador
- [x] Criar página OrganizerPanel
- [x] Adicionar formulário de dados bancários
- [x] Integrar com Pagar.me para criar recipient
- [ ] Validar CPF/CNPJ em tempo real
- [ ] Adicionar feedback visual de sucesso/erro

## Banco de Dados
- [x] Atualizar schema para campos de endereço
- [x] Atualizar schema para campos bancários
- [ ] Criar tabela de eventos
- [ ] Criar tabela de inscrições

## Próximos Passos
- [ ] Implementar sistema de eventos
- [ ] Criar dashboard de participantes
- [ ] Integrar pagamentos com Pagar.me
- [ ] Adicionar notificações por email

## Redirecionamento Automático Pós-Login
- [ ] Criar hook useOrganizerRegistrationCheck
- [ ] Integrar no App.tsx para redirecionar automaticamente
- [ ] Adicionar flag isOrganizerRegistrationComplete ao schema
- [ ] Testar fluxo completo
