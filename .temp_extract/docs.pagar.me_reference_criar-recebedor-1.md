# Criar recebedor

**URL:** https://docs.pagar.me/reference/criar-recebedor-1

---

Jump to Content
Guides
Suporte
API Reference
V5 (2021-09-01)
API Reference
Search
CTRL-K
JUMP TO
CTRL-/
PAGAR.ME API
Introdução
Segurança
Autenticação
Erros
Paginação
Metadata
Telefones
Entregas
Facilitadores de pagamento (Dados de Subadquirente)
CARTEIRA DE CLIENTES
Clientes
Cartões
Endereços
BIN
PAGAMENTOS
Visão Geral sobre Pagamento
Pedidos
Item do pedido
Cobranças
ANTIFRAUDE
Visão Geral sobre Antifraude
LINK DE PAGAMENTO
Link de Pagamento
Criar link de pagamento
POST
Obter link de pagamento
GET
Obter links de pagamento
GET
Ativar link de pagamento em construção
PATCH
Cancelar link de pagamento
PATCH
RECORRÊNCIA
Precificação
Planos
Assinaturas
Item da assinatura
Uso de um item da assinatura
Item do plano
Desconto
Incremento
Faturas
Ciclos
Split
RECEBEDORES
Recebedores
Criar recebedor
POST
Criar link de de Prova de Vida (KYC)
POST
Editar recebedor
PUT
Obter recebedor
GET
Listar recebedores
GET
Editar code de recebedor
PATCH
Conta bancária
Saldo
Saque
Configurações de transferência
Configurações de antecipação automática
FINANCEIRO
Recebíveis
Operações de Saldo
MARKETPLACE
Visão Geral do Marketplace
Split
Res.264/349: Interface Eletrônica para Sellers
TOKENIZECARD JS
Tokenizecard JS
Alternativas ao Tokenizecard JS
WEBHOOK
Visão geral sobre Webhooks
PAGAR.ME API - REGISTER V5
Getting Started With Your API
ANTECIPAÇÕES
Objeto antecipação
Criando uma antecipação
POST
Simulando uma Antecipação Spot
GET
Obtendo os limites de antecipação
GET
Cancelando uma antecipação pending
POST
Retornando antecipações
GET
LIQUIDAÇÕES
Objeto Settlements
Retornando pagamentos
GET
Retornando pagamentos por recebedor
GET
Retornando um pagamento
GET
TRANSFERÊNCIAS
Objeto Transferência
Criando uma transferência
POST
Retornando transferências
GET
Retornando uma transferência
GET
Cancelando uma transferência
POST
Retornando o comprovante de uma transferência
POST
Powered by 
Criar recebedor
Ask AI
POST
https://api.pagar.me/core/v5/recipients

Rota para criar um recebedor, definindo os dados do recebedor, transferência e qual a conta bancária que será utilizada para envio dos pagamentos.

Recent Requests
Log in to see full request history
TIME	STATUS	USER AGENT	

Retrieving recent requests…
🚧

Atenção - Mudanças no contrato de recebedores

Com objetivo de atender as diretrizes dispostas na Circular 3.978/20 do Banco Central sobre os procedimentos a serem adotados para prevenção à lavagem de dinheiro e financiamento ao terrorismo é imprescindível o envio de dados mínimos de cadastro para os sellers dos marketplaces.

O novo contrato para a criação de recebedores entrou em vigor em Fevereiro de 2024. Para obter mais informações, consulte o artigo Mudanças de contrato na criação de Recebedores.

Body Params
code
string

Referencia externa única por recebedor

register_information
object
required

Dados cadastrais do recebedor. O objeto deve ser preenchido de acordo com o tipo do recebedor, Pessoa Física [PF] ou Pessoa Jurídica [PJ].

REGISTER_INFORMATION OBJECT
default_bank_account
object
required

Dados da conta bancária do recebedor.

DEFAULT_BANK_ACCOUNT OBJECT
transfer_settings
object

Informações de transferência do recebedor

TRANSFER_SETTINGS OBJECT
automatic_anticipation_settings
object

Informações de antecipação automática do recebedor

AUTOMATIC_ANTICIPATION_SETTINGS OBJECT
metadata
string

Objeto chave/valor utilizado para armazenar informações adicionais sobre o recebedor.

Responses
200

200

400

400

Updated about 1 year ago

Recebedores
Criar link de de Prova de Vida (KYC)
Did this page help you?
Yes
No
LANGUAGE
Shell
Node
Ruby
PHP
Python
CREDENTIALS
BASIC
BASE64
Basic
:
cURL Request
Examples
1
curl --request POST \
2
     --url https://api.pagar.me/core/v5/recipients \
3
     --header 'accept: application/json' \
4
     --header 'content-type: application/json'
Try It!
RESPONSE
Examples
Click Try It! to start a request and see the response here! Or choose an example:
application/json
200 - Result
400 - Result