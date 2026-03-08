
**URL:** https://docs.pagar.me/v4/docs/criando-um-recebedor-1

---

Jump to Content
Guides
Suporte
API Reference
V4 (2019-09-01)
Guides
Recebedores
Search
CTRL-K
These docs are for v4. Click to read the latest docs for v5.
CONHECENDO O PAGAR.ME
Overview
Quickstart Pagar.me
Dashboard
Índice de conversão
Índice de chargeback
Chaves de acesso
Versionamento
Rate Limit
Bibliotecas
TRANSAÇÃO
Overview
Obtendo os dados do Cartão
Cartão de crédito
Boleto bancário
Score Pagar.me
Usando Metadata
Autorização e captura
Estorno
Chave de referência
Calculadora de taxas
INTEGRAÇÃO VIA CHECKOUT PAGAR.ME
Overview
Inserindo o Checkout Pagar.me
Configurações do Checkout
LINK DE PAGAMENTO
Overview
Criando um Link de Pagamento
Consultando links de pagamento criados
Personalizando o logo e a cor do link de pagamento
MARKETPLACE
Overview
Dados bancários
Recebedores
Dividindo uma transação
RECORRÊNCIA
Overview
Planos
Assinaturas
Conceitos de recorrência
Fluxos de cobrança
GERENCIAMENTO DE SALDO
Overview
Saque
Recebíveis
Operações de saldo
Extrato
ANTECIPAÇÃO
Overview
Criação
Simulação
Consulta
Cancelamento
RECEBENDO NOTIFICAÇÕES (POSTBACKS)
Overview
Gerenciando postbacks
INTEGRAÇÃO COM PLATAFORMAS
Overview
FLUXO DE MIGRAÇÃO DE CARTÕES
Fluxo de Migração de Cartões
INSERINDO REGRAS DE SEGURANÇA
Inserindo regras de segurança
Deletando Regras de Segurança
CONCILIAÇÃO
Overview - Conciliação
Dados necessários
Como extrair os dados
REFERÊNCIA COMPLETA DA API
Referência completa da API
Powered by 
Recebedores
Suggest Edits

Um recipient é um recebedor — isto é, um vendedor ou empresa que expõe os seus produtos dentro do seu Marketplace. Dentro do ambiente Pagar.me é atribuido um saldo a esse recebedor, de acordo com as transações que tenham sido criadas através da loja. Para isso, você precisa criar o objeto recipient pela API.

É através de um recipient que você especifica as suas regras de split, para que os valores a receber sejam automaticamente atribuídos a cada um dos sellers envolvidos na transação.

Criando um recebedor

Vamos aprender a criar um novo recipient, e em seguida entender cada parâmetro passado. Veja este exemplo:

cURL
Ruby
PHP
C#
JS
Java
Python
curl -X POST https://api.pagar.me/1/recipients -H 'content-type: application/json' -d 
{
    "anticipatable_volume_percentage": "85",
    "api_key": "SUA_API_KEY",
    "automatic_anticipation_enabled":true,
    "bank_account": {
        "bank_code": "341",
        "agencia": "0932",
        "agencia_dv": "5",
        "conta": "58054",
        "type": "conta_corrente",
        "conta_dv": "1",
        "document_number": "26268738888",
        "legal_name": "API BANK ACCOUNT"
    },
    "register_information": {
        "type": "corporation",
        "document_number": "43633675456",
        "company_name": "Full Name Company",
        "email": "some@email.com",
        "site_url": "http://www.site.com",
        "annual_revenue": "100000",
        "address": {
            "street": "Rua de Exemplo",
            "number": "100",
            "neighborhood": "Centro",
            "zip_code": "12345678",
            "city": "São Paulo",
            "state": "SP",
            "country": "BR",
            "complement": "Loja 100",
            "reference_point": "Ao lado do mercado"
        },
        "phone_numbers": [
            {
                "ddd": "11",
                "number": "11987654321",
                "type": "mobile"
            }
        ],
        "managing_partners": [{
            "name": "Teste Onboarding",
            "document_number": "50107915014",
            "mother_name": "Eliana das Neves",
            "birthdate": "01/01/0001",
            "email": "some@email.com",